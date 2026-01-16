import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { logAgentActivity } from '$lib/server/storage';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LETTA_URL = env.LETTA_URL ?? 'http://localhost:8283';

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

	const { mode = 'all', topicId } = body;

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

	if (mode === 'topic' && topicId) {
		curatePrompt = `
Please curate content specifically for the topic: ${topicId}

1. Use get_conversation_details('${topicId}') to see what the student asked about this topic
2. Use get_student_notes('${topicId}') to see their personal notes
3. Use get_current_extensions to check what's already been added
4. Based on the conversation and notes:
   - Identify specific questions or confusion points
   - Find 1-2 highly relevant resources using web_search
   - Create a code example if it would help clarify a concept
   - Consider generating a focused lesson if there's a pattern of confusion

Remember: Quality over quantity. Only add content that directly addresses the student's needs.
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
	} else {
		// Full curation
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

Update your memory with what you've learned about the student's progress.
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
		modes: ['all', 'topic', 'analyze']
	});
};
