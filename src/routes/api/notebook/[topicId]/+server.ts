import { json } from '@sveltejs/kit';
import { getNotebook, addMessageToNotebook, clearNotebook } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const notebook = getNotebook(params.topicId);
	return json(notebook);
};

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();

	if (body.action === 'clear') {
		const notebook = clearNotebook(params.topicId);
		return json(notebook);
	}

	const message = {
		role: body.role as 'user' | 'assistant',
		content: body.content,
		timestamp: new Date().toISOString()
	};

	const notebook = addMessageToNotebook(params.topicId, message);
	return json(notebook);
};
