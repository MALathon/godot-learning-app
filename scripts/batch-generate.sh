#!/bin/bash
# Batch generate prose content for all topics and run continuous curation

BASE_URL="${INTERNAL_URL:-http://localhost:5173}"
TOPICS=("scene-tree" "signals" "nodes-resources" "servers" "gdscript-internals" "composition" "state-machines")

echo "=================================="
echo "BATCH CONTENT GENERATION"
echo "=================================="
echo "Base URL: $BASE_URL"
echo "Topics: ${#TOPICS[@]}"
echo ""

# Phase 1: Generate prose content for all topics using Anthropic API
echo "=== PHASE 1: Generating Prose Content ==="
for topic in "${TOPICS[@]}"; do
    echo ""
    echo ">>> Generating prose for: $topic"
    response=$(curl -s -X POST "$BASE_URL/api/content/generate" \
        -H "Content-Type: application/json" \
        -d "{\"topicId\": \"$topic\", \"regenerate\": false}" \
        --max-time 180)

    if echo "$response" | grep -q '"success":true'; then
        sections=$(echo "$response" | grep -o '"sectionsCount":[0-9]*' | cut -d: -f2)
        echo "    ✓ Generated $sections sections"
    elif echo "$response" | grep -q '"cached":true'; then
        echo "    ○ Already exists (cached)"
    else
        error=$(echo "$response" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
        echo "    ✗ Failed: $error"
    fi
done

echo ""
echo "=== PHASE 2: Filling Content Gaps ==="
# Phase 2: Analyze and fill gaps for all topics
for topic in "${TOPICS[@]}"; do
    echo ""
    echo ">>> Analyzing gaps for: $topic"
    response=$(curl -s -X POST "$BASE_URL/api/content/fill-gaps" \
        -H "Content-Type: application/json" \
        -d "{\"topicId\": \"$topic\", \"mode\": \"single\"}" \
        --max-time 60)

    if echo "$response" | grep -q '"success":true'; then
        echo "    ✓ Gap filling triggered"
    else
        echo "    ○ Skipped or already complete"
    fi
done

echo ""
echo "=== PHASE 3: Continuous Curation Loop ==="
echo "Running curation every 2 minutes..."
echo ""

# Phase 3: Continuous curation loop
while true; do
    timestamp=$(date '+%H:%M:%S')

    # Pick a random topic for deep curation
    random_topic=${TOPICS[$RANDOM % ${#TOPICS[@]}]}

    echo "[$timestamp] Curating: $random_topic"

    # Trigger deep curation with Letta agent
    response=$(curl -s -X POST "$BASE_URL/api/letta/curate" \
        -H "Content-Type: application/json" \
        -d "{\"mode\": \"generate\", \"topicId\": \"$random_topic\"}" \
        --max-time 90)

    if echo "$response" | grep -q '"success":true'; then
        tools=$(echo "$response" | grep -o '"toolsUsed":\[[^]]*\]' | grep -o '"name":"[^"]*"' | wc -l)
        echo "    ✓ Curation complete (${tools} tools used)"
    else
        echo "    ○ Curation skipped or failed"
    fi

    # Also check notifications
    notif_count=$(curl -s "$BASE_URL/api/notifications?countOnly=true" | grep -o '"unseenCount":[0-9]*' | cut -d: -f2)
    echo "    📬 Unseen notifications: ${notif_count:-0}"

    echo ""
    sleep 120  # Wait 2 minutes before next curation
done
