import { json } from '@sveltejs/kit';
import { getLearningGoal, saveLearningGoal } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// GET - Get current learning goal
export const GET: RequestHandler = async () => {
	const goal = getLearningGoal();
	return json(goal);
};

// POST - Update learning goal
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { goal } = body;

	if (!goal || typeof goal !== 'string') {
		return json({ error: 'goal string is required' }, { status: 400 });
	}

	// Limit goal length
	if (goal.length > 500) {
		return json({ error: 'Goal must be 500 characters or less' }, { status: 400 });
	}

	const updated = saveLearningGoal(goal.trim());
	return json({
		success: true,
		...updated
	});
};
