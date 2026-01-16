import { json } from '@sveltejs/kit';
import { getRecentAgentActivity, getAgentActivityForTopic } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// GET - Retrieve recent agent activity
export const GET: RequestHandler = async ({ url }) => {
	const topicId = url.searchParams.get('topicId');
	const limitParam = url.searchParams.get('limit');
	let limit = limitParam ? parseInt(limitParam, 10) : 20;

	// Validate limit parameter
	if (isNaN(limit) || limit < 1) {
		limit = 20;
	} else if (limit > 100) {
		limit = 100; // Cap at 100 to prevent abuse
	}

	if (topicId) {
		const activities = getAgentActivityForTopic(topicId, limit);
		return json({
			topicId,
			activities,
			count: activities.length
		});
	}

	const activities = getRecentAgentActivity(limit);
	return json({
		activities,
		count: activities.length
	});
};
