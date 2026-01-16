import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LETTA_URL = env.LETTA_URL ?? 'http://localhost:8283';

// Load agent IDs from the letta folder
function getAgentIds(): { gideon?: string; curator?: string; shared_blocks?: Record<string, string> } {
	const agentIdsPath = join(process.cwd(), 'letta', 'agent_ids.json');

	if (existsSync(agentIdsPath)) {
		try {
			const data = readFileSync(agentIdsPath, 'utf-8');
			return JSON.parse(data);
		} catch {
			return {};
		}
	}

	return {};
}

// Default memory block values
const DEFAULT_MEMORY = {
	persona: `
I am Gideon, a friendly and knowledgeable Godot game engine tutor.

My role is to help Mark learn game engine internals through his tic-tac-toe project.
I explain concepts clearly, connect theory to practical Godot usage, and encourage exploration.

I have access to the learning curriculum and can see Mark's progress, notes, and conversation history.
I can also search for resources and add helpful content to topics.
`,
	human: `
Name: Mark
Background: Experienced Python developer, new to game development
Current project: Building a tic-tac-toe game in Godot to learn game engine concepts
Learning style: Prefers understanding the "why" behind things, likes seeing code examples
`,
	learning_progress: `
No learning data yet. The student hasn't started studying any topics.
`,
	curated_content: `
No content has been curated yet.
`
};

// POST - Reset agent memory
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const { agent = 'all', blocks = 'all' } = body;
	const agentIds = getAgentIds();

	if (!agentIds.gideon && !agentIds.curator) {
		return json({
			error: 'No agents found. Run setup_agents.py first.',
			hint: 'cd letta && python setup_agents.py'
		}, { status: 503 });
	}

	const results: Array<{ agent: string; block: string; status: string }> = [];

	// Determine which agents to reset
	const agentsToReset: Array<{ id: string; name: string }> = [];
	if (agent === 'all' || agent === 'gideon') {
		if (agentIds.gideon) agentsToReset.push({ id: agentIds.gideon, name: 'gideon' });
	}
	if (agent === 'all' || agent === 'curator') {
		if (agentIds.curator) agentsToReset.push({ id: agentIds.curator, name: 'curator' });
	}

	for (const agentInfo of agentsToReset) {
		try {
			// Fetch agent to get block IDs
			const agentResponse = await fetch(`${LETTA_URL}/v1/agents/${agentInfo.id}`, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!agentResponse.ok) {
				results.push({ agent: agentInfo.name, block: '*', status: 'agent_not_found' });
				continue;
			}

			const agentData = await agentResponse.json();
			const memoryBlocks = agentData.memory?.blocks || [];

			// Determine which blocks to reset
			const blocksToReset = blocks === 'all'
				? memoryBlocks
				: memoryBlocks.filter((b: { label: string }) =>
					Array.isArray(blocks) ? blocks.includes(b.label) : b.label === blocks
				);

			for (const block of blocksToReset) {
				const defaultValue = DEFAULT_MEMORY[block.label as keyof typeof DEFAULT_MEMORY] || '';

				try {
					const updateResponse = await fetch(`${LETTA_URL}/v1/blocks/${block.id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ value: defaultValue.trim() })
					});

					if (updateResponse.ok) {
						results.push({ agent: agentInfo.name, block: block.label, status: 'reset' });
					} else {
						results.push({ agent: agentInfo.name, block: block.label, status: 'failed' });
					}
				} catch {
					results.push({ agent: agentInfo.name, block: block.label, status: 'error' });
				}
			}
		} catch (error) {
			results.push({ agent: agentInfo.name, block: '*', status: 'error' });
		}
	}

	return json({
		success: true,
		message: `Reset ${results.filter(r => r.status === 'reset').length} memory blocks`,
		results
	});
};

// GET - Check reset capability
export const GET: RequestHandler = async () => {
	const agentIds = getAgentIds();

	return json({
		available: !!(agentIds.gideon || agentIds.curator),
		agents: {
			gideon: !!agentIds.gideon,
			curator: !!agentIds.curator
		},
		resetOptions: {
			agents: ['all', 'gideon', 'curator'],
			blocks: ['all', 'persona', 'human', 'learning_progress', 'curated_content']
		}
	});
};
