import { json } from '@sveltejs/kit';
import { getProgress, saveProgress, updateTopicProgress } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const progress = getProgress();
	return json(progress);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	if (body.topicId && body.update) {
		const progress = updateTopicProgress(body.topicId, body.update);
		return json(progress);
	}

	// Full progress update
	saveProgress(body);
	return json(body);
};
