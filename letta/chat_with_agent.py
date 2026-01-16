#!/usr/bin/env python3
"""
Chat with the Godot Learning Agents

This script lets you interact with:
- Gideon (primary tutor) for learning conversations
- Curator (background agent) for content curation

Usage:
    python chat_with_agent.py              # Interactive chat with Gideon
    python chat_with_agent.py --curate     # Trigger full curation session
    python chat_with_agent.py --curate game-loop  # Curate specific topic
    python chat_with_agent.py --curator    # Chat with Curator directly
    python chat_with_agent.py --analyze    # Analyze learning progress
"""

import os
import sys
import json
from letta_client import Letta

LETTA_BASE_URL = os.getenv("LETTA_BASE_URL", "http://localhost:8283")

# Connect to local Letta server
client = Letta(base_url=LETTA_BASE_URL)

# Load agent IDs
agent_file = os.path.join(os.path.dirname(__file__), "agent_ids.json")
legacy_file = os.path.join(os.path.dirname(__file__), "agent_id.txt")

if os.path.exists(agent_file):
    with open(agent_file) as f:
        agent_ids = json.load(f)
    GIDEON_ID = agent_ids.get("gideon")
    CURATOR_ID = agent_ids.get("curator")
elif os.path.exists(legacy_file):
    # Backward compatibility with old single-agent setup
    with open(legacy_file) as f:
        GIDEON_ID = f.read().strip()
    CURATOR_ID = None
    print("Note: Using legacy single-agent setup. Run setup_agents.py for multi-agent features.")
else:
    print("ERROR: Agent not found. Run setup_agents.py first.")
    exit(1)


def send_message(agent_id: str, content: str, agent_name: str = "Agent"):
    """Send a message and print the response."""
    response = client.agents.messages.create(
        agent_id=agent_id,
        messages=[{"role": "user", "content": content}]
    )

    for message in response.messages:
        if hasattr(message, 'reasoning') and message.reasoning:
            print(f"\n[Thinking]: {message.reasoning[:300]}...")
        if hasattr(message, 'content') and message.content:
            print(f"\n[{agent_name}]: {message.content}")
        if hasattr(message, 'tool_calls') and message.tool_calls:
            for tc in message.tool_calls:
                print(f"\n[Tool: {tc.function.name}]")
                if hasattr(tc.function, 'arguments'):
                    args = tc.function.arguments
                    if len(str(args)) > 150:
                        print(f"  Args: {str(args)[:150]}...")
                    else:
                        print(f"  Args: {args}")


def curate_all():
    """Trigger a full curation session with the Curator agent."""
    if not CURATOR_ID:
        print("Curator agent not available. Run setup_agents.py first.")
        return

    print("\nTriggering full curation session with Curator...")
    send_message(CURATOR_ID, """
    Please perform a comprehensive curation session:

    1. Use get_recent_conversations to see which topics have recent activity
    2. For active topics, use get_conversation_details to understand what the student asked
    3. Use get_student_progress to see overall learning status
    4. Use get_current_extensions to see what has already been added
    5. Based on your analysis:
       - Identify knowledge gaps or confusion points
       - Search for 2-3 high-quality resources to address these gaps
       - Add resources using add_resource
       - If you see code-related questions, create helpful examples with add_code_example
       - If there's a significant confusion, consider generating a lesson with add_lesson

    Focus on:
    - Official Godot documentation
    - GDQuest tutorials
    - Game Programming Patterns book references
    - Clear, beginner-friendly explanations

    Update your memory with what you've learned about Mark's progress.
    """, "Curator")


def curate_topic(topic_id: str):
    """Trigger curation for a specific topic."""
    if not CURATOR_ID:
        print("Curator agent not available. Run setup_agents.py first.")
        return

    print(f"\nCurating content for topic: {topic_id}...")
    send_message(CURATOR_ID, f"""
    Please curate content specifically for the topic: {topic_id}

    1. Use get_conversation_details('{topic_id}') to see what the student asked about this topic
    2. Use get_student_notes('{topic_id}') to see their personal notes
    3. Use get_current_extensions to check what's already been added
    4. Based on the conversation and notes:
       - Identify specific questions or confusion points
       - Find 1-2 highly relevant resources
       - Create a code example if it would help clarify a concept
       - Consider generating a focused lesson if there's a pattern of confusion

    Remember: Quality over quantity. Only add content that directly addresses Mark's needs.
    """, "Curator")


def analyze_progress():
    """Have Curator analyze overall learning progress."""
    if not CURATOR_ID:
        print("Curator agent not available. Run setup_agents.py first.")
        return

    print("\nAnalyzing learning progress...")
    send_message(CURATOR_ID, """
    Please analyze Mark's overall learning progress:

    1. Use get_student_progress to see completion status across all topics
    2. Use get_recent_conversations to see activity patterns
    3. Use get_topics to understand the curriculum structure

    Provide insights on:
    - Which topics has Mark spent the most time on?
    - What patterns do you see in his questions?
    - What topics should he focus on next?
    - Are there any knowledge gaps that span multiple topics?

    Update your memory with these insights for future curation.
    """, "Curator")


def interactive(agent_id: str, agent_name: str):
    """Interactive chat mode."""
    print(f"\nInteractive mode with {agent_name}.")
    print("Commands: 'quit' to exit, 'curate' for curation, 'analyze' for progress analysis")
    print("-" * 50)

    while True:
        try:
            user_input = input("\nYou: ").strip()
            if not user_input:
                continue
            if user_input.lower() == 'quit':
                break
            if user_input.lower() == 'curate':
                curate_all()
                continue
            if user_input.lower() == 'analyze':
                analyze_progress()
                continue
            if user_input.lower().startswith('curate '):
                topic = user_input[7:].strip()
                curate_topic(topic)
                continue
            send_message(agent_id, user_input, agent_name)
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break


def main():
    args = sys.argv[1:]

    if '--curate' in args:
        idx = args.index('--curate')
        if idx + 1 < len(args) and not args[idx + 1].startswith('-'):
            # Curate specific topic
            curate_topic(args[idx + 1])
        else:
            # Full curation
            curate_all()
    elif '--curator' in args:
        if not CURATOR_ID:
            print("Curator agent not available. Run setup_agents.py first.")
            exit(1)
        print(f"Connected to Curator: {CURATOR_ID}")
        interactive(CURATOR_ID, "Curator")
    elif '--analyze' in args:
        analyze_progress()
    elif len(args) > 0 and not args[0].startswith('-'):
        # Send single message to Gideon
        print(f"Connected to Gideon: {GIDEON_ID}")
        send_message(GIDEON_ID, ' '.join(args), "Gideon")
    else:
        # Interactive mode with Gideon
        print(f"Connected to Gideon: {GIDEON_ID}")
        interactive(GIDEON_ID, "Gideon")


if __name__ == "__main__":
    main()
