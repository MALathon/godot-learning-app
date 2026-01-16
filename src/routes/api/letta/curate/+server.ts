import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { logAgentActivity } from '$lib/server/storage';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LETTA_URL = env.LETTA_URL ?? 'http://localhost:8283';

// Simple rate limiting for background curation
const recentCurations = new Map<string, number>();
const CURATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between curations per topic

function shouldSkipCuration(topicId: string, background: boolean): boolean {
	if (!background) return false; // Manual triggers always proceed

	const key = topicId || 'global';
	const lastCuration = recentCurations.get(key);
	const now = Date.now();

	if (lastCuration && (now - lastCuration) < CURATION_COOLDOWN_MS) {
		return true; // Skip - too recent
	}

	recentCurations.set(key, now);
	return false;
}

// Load agent IDs from the letta folder
function getAgentIds(): { gideon?: string; curator?: string } {
	const agentIdsPath = join(process.cwd(), 'letta', 'agent_ids.json');
	const legacyPath = join(process.cwd(), 'letta', 'agent_id.txt');

	if (existsSync(agentIdsPath)) {
		try {
			const data = readFileSync(agentIdsPath, 'utf-8');
			return JSON.parse(data);
		} catch {
			// Fall through to legacy
		}
	}

	if (existsSync(legacyPath)) {
		try {
			const gideonId = readFileSync(legacyPath, 'utf-8').trim();
			return { gideon: gideonId };
		} catch {
			// No agents available
		}
	}

	return {};
}

// POST - Trigger curation
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { mode = 'all', topicId, contentType, background = false } = body;

	// Rate limit background curations
	if (shouldSkipCuration(topicId, background)) {
		return json({
			success: true,
			skipped: true,
			message: 'Curation skipped - recent curation still fresh'
		});
	}

	const agentIds = getAgentIds();
	const curatorId = agentIds.curator || agentIds.gideon;

	if (!curatorId) {
		return json({
			error: 'No agent available. Run setup_agents.py first.',
			hint: 'cd letta && python setup_agents.py'
		}, { status: 503 });
	}

	// Build the curation prompt based on mode
	let curatePrompt: string;

	if (mode === 'generate' && topicId) {
		// Content generation mode - actively create new materials
		const typeHint = contentType ? ` Focus on creating: ${contentType}.` : '';
		curatePrompt = `
You are now in CONTENT GENERATION mode for topic: ${topicId}${typeHint}

Your task is to CREATE NEW LEARNING MATERIALS. Follow these steps:

1. RESEARCH PHASE:
   - Use get_current_extensions('${topicId}') to see what already exists
   - Use get_conversation_details('${topicId}') to understand what the student struggled with
   - Use web_search to find HIGH-QUALITY resources about this topic
   - Search for: official Godot docs, GDQuest tutorials, game dev best practices

2. RESOURCE CURATION (add 2-3 resources):
   For each good resource you find, use add_resource with:
   - topic_id: "${topicId}"
   - title: Clear, descriptive title
   - url: The actual URL
   - type: "docs" | "video" | "book" | "source"
   - description: Why this resource is helpful (2-3 sentences)

3. CODE EXAMPLE CREATION (add 1-2 examples):
   Create practical code examples using add_code_example with:
   - topic_id: "${topicId}"
   - title: What the example demonstrates
   - language: "gdscript" or "cpp"
   - code: Working, well-commented code
   - explanation: Step-by-step breakdown

4. LESSON GENERATION (if appropriate):
   If the topic needs deeper explanation, use add_lesson with:
   - topic_id: "${topicId}"
   - title: Lesson title
   - difficulty: "beginner" | "intermediate" | "advanced"
   - introduction: Why this matters
   - concepts: Array of key points
   - explanation: Detailed markdown explanation
   - exercises: Practice prompts
   - connections: Related topics

ACTION REQUIRED: You MUST use add_resource, add_code_example, or add_lesson tools.
Do not just analyze - actually CREATE content now.
		`.trim();
	} else if (mode === 'topic' && topicId) {
		curatePrompt = `
Please curate content specifically for the topic: ${topicId}

1. Use get_conversation_details('${topicId}') to see what the student asked about this topic
2. Use get_student_notes('${topicId}') to see their personal notes
3. Use get_current_extensions('${topicId}') to check what's already been added
4. Based on the conversation and notes:
   - Identify specific questions or confusion points
   - Find 1-2 highly relevant resources using web_search
   - Create a code example if it would help clarify a concept
   - Consider generating a focused lesson if there's a pattern of confusion

ACTION: Actually add the content using add_resource, add_code_example, or add_lesson tools.
		`.trim();
	} else if (mode === 'analyze') {
		curatePrompt = `
Please analyze the student's overall learning progress:

1. Use get_student_progress to see completion status across all topics
2. Use get_recent_conversations to see activity patterns
3. Use get_topics to understand the curriculum structure

Provide insights on:
- Which topics has the student spent the most time on?
- What patterns do you see in their questions?
- What topics should they focus on next?
- Are there any knowledge gaps that span multiple topics?

Update your memory with these insights for future curation.
		`.trim();
	} else if (mode === 'enrich') {
		// Enrich all topics with baseline content
		curatePrompt = `
You are in ENRICHMENT mode. Your goal is to add valuable content to topics that need it.

1. Use get_topics to see all available topics
2. For each topic, use get_current_extensions to check existing content
3. For topics with FEW resources (< 3), use web_search to find good materials
4. ADD at least one resource or code example to topics that need it

Priority order for resources:
1. Official Godot documentation (docs.godotengine.org)
2. GDQuest tutorials (gdquest.com)
3. Game Programming Patterns (gameprogrammingpatterns.com)
4. High-quality YouTube tutorials

ACTION REQUIRED: Use add_resource for each good resource you find.
Target: Add content to at least 3 different topics.
		`.trim();
	} else {
		// Full curation (default)
		curatePrompt = `
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

ACTION: Actually add content - don't just analyze. Use add_resource, add_code_example, or add_lesson.
		`.trim();
	}

	// Log that curation was triggered
	logAgentActivity({
		type: 'thinking',
		details: `Curation triggered (mode: ${mode}${topicId ? `, topic: ${topicId}` : ''})`,
		topicId: topicId || undefined,
		agentName: 'curator'
	});

	try {
		// Send the message to the curator agent
		const response = await fetch(`${LETTA_URL}/v1/agents/${curatorId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: curatePrompt }]
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Letta API error:', errorText);
			return json({
				error: 'Failed to trigger curation',
				details: errorText
			}, { status: response.status });
		}

		const data = await response.json();

		// Extract any tool calls made during curation
		const toolCalls: Array<{ name: string; status: string }> = [];
		for (const msg of data.messages || []) {
			if (msg.message_type === 'tool_call_message' && msg.tool_call?.name) {
				toolCalls.push({
					name: msg.tool_call.name,
					status: 'completed'
				});
			}
		}

		return json({
			success: true,
			mode,
			topicId: topicId || null,
			agentId: curatorId,
			toolsUsed: toolCalls,
			message: `Curation ${mode === 'analyze' ? 'analysis' : 'session'} completed`
		});
	} catch (error) {
		console.error('Curation error:', error);
		return json({
			error: 'Failed to communicate with Letta server',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// GET - Check curation status/capability
export const GET: RequestHandler = async () => {
	const agentIds = getAgentIds();

	// Check if Letta server is available
	let lettaAvailable = false;
	try {
		const response = await fetch(`${LETTA_URL}/v1/health`, { method: 'GET' });
		lettaAvailable = response.ok;
	} catch {
		lettaAvailable = false;
	}

	return json({
		available: lettaAvailable && !!(agentIds.curator || agentIds.gideon),
		lettaServer: LETTA_URL,
		lettaConnected: lettaAvailable,
		agents: {
			gideon: agentIds.gideon || null,
			curator: agentIds.curator || null
		},
		modes: ['all', 'topic', 'analyze', 'generate', 'enrich']
	});
};
