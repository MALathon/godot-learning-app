import { json } from '@sveltejs/kit';
import { LETTA_URL, getAgentIds } from '$lib/server/letta';
import type { RequestHandler } from './$types';

// GET - Retrieve agent memory blocks
export const GET: RequestHandler = async ({ url }) => {
	const agentParam = url.searchParams.get('agent') || 'gideon';
	const agentIds = getAgentIds();

	const agentId = agentParam === 'curator' ? agentIds.curator : agentIds.gideon;

	if (!agentId) {
		return json({
			error: 'Agent not found. Run setup_agents.py first.',
			hint: 'cd letta && python setup_agents.py'
		}, { status: 503 });
	}

	try {
		// Fetch agent details including memory blocks
		const response = await fetch(`${LETTA_URL}/v1/agents/${agentId}`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		});

		if (!response.ok) {
			const errorText = await response.text();
			return json({
				error: 'Failed to fetch agent memory',
				details: errorText
			}, { status: response.status });
		}

		const agentData = await response.json();

		// Extract memory blocks
		const memoryBlocks: Array<{
			label: string;
			value: string;
			limit?: number;
			isShared: boolean;
		}> = [];

		// Get memory from the agent response
		if (agentData.memory?.blocks) {
			for (const block of agentData.memory.blocks) {
				memoryBlocks.push({
					label: block.label,
					value: block.value || '',
					limit: block.limit,
					isShared: ['learning_progress', 'curated_content'].includes(block.label)
				});
			}
		}

		return json({
			agentId,
			agentName: agentData.name || agentParam,
			memoryBlocks,
			blockCount: memoryBlocks.length,
			sharedBlocks: memoryBlocks.filter(b => b.isShared).map(b => b.label)
		});
	} catch (error) {
		console.error('Memory fetch error:', error);
		return json({
			error: 'Failed to communicate with Letta server',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST - Update agent memory block
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { agent = 'gideon', blockLabel, value } = body;

	if (!blockLabel || typeof blockLabel !== 'string') {
		return json({ error: 'blockLabel is required' }, { status: 400 });
	}
	if (value === undefined || typeof value !== 'string') {
		return json({ error: 'value is required and must be a string' }, { status: 400 });
	}

	const agentIds = getAgentIds();
	const agentId = agent === 'curator' ? agentIds.curator : agentIds.gideon;

	if (!agentId) {
		return json({
			error: 'Agent not found. Run setup_agents.py first.'
		}, { status: 503 });
	}

	try {
		// First get the agent to find the block ID
		const agentResponse = await fetch(`${LETTA_URL}/v1/agents/${agentId}`, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		});

		if (!agentResponse.ok) {
			return json({ error: 'Failed to fetch agent' }, { status: agentResponse.status });
		}

		const agentData = await agentResponse.json();
		const block = agentData.memory?.blocks?.find(
			(b: { label: string }) => b.label === blockLabel
		);

		if (!block) {
			return json({
				error: `Memory block '${blockLabel}' not found`,
				availableBlocks: agentData.memory?.blocks?.map((b: { label: string }) => b.label) || []
			}, { status: 404 });
		}

		// Update the block
		const updateResponse = await fetch(`${LETTA_URL}/v1/blocks/${block.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value })
		});

		if (!updateResponse.ok) {
			const errorText = await updateResponse.text();
			return json({
				error: 'Failed to update memory block',
				details: errorText
			}, { status: updateResponse.status });
		}

		const updatedBlock = await updateResponse.json();

		return json({
			success: true,
			message: `Updated memory block '${blockLabel}'`,
			block: {
				label: updatedBlock.label,
				value: updatedBlock.value,
				limit: updatedBlock.limit
			}
		});
	} catch (error) {
		console.error('Memory update error:', error);
		return json({
			error: 'Failed to communicate with Letta server',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
