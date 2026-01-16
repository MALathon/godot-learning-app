import { json } from '@sveltejs/kit';
import { getRecentAgentActivity, getAgentActivityForTopic } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// GET - Retrieve recent agent activity
export const GET: RequestHandler = async ({ url }) => {
	const topicId = url.searchParams.get('topicId');
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? parseInt(limitParam, 10) : 20;

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
