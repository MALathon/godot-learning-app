import { json } from '@sveltejs/kit';
import { getTopicExtension } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const extension = getTopicExtension(params.topicId);
	return json(extension);
};
