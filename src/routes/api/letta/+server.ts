import { json } from '@sveltejs/kit';
import {
	addResourceToTopic,
	addCodeExampleToTopic,
	getTopicExtension,
	getAllTopicExtensions,
	listNotebooks,
	getNotebook
} from '$lib/server/storage';
import { topics } from '$lib/data/topics';
import type { RequestHandler } from './$types';

// GET - Letta can fetch current state
export const GET: RequestHandler = async ({ url }) => {
	const action = url.searchParams.get('action');

	switch (action) {
		case 'topics':
			// Return all topic metadata for Letta to understand the curriculum
			return json({
				topics: topics.map(t => ({
					id: t.id,
					title: t.title,
					category: t.category,
					description: t.description,
					keyPoints: t.keyPoints,
					exerciseCount: t.exercises.length,
					resourceCount: t.resources.length,
					codeExampleCount: t.codeExamples.length
				}))
			});

		case 'extensions':
			// Return all dynamically added content
			return json({ extensions: getAllTopicExtensions() });

		case 'notebooks':
			// Return notebook summaries for Letta to analyze
			return json({ notebooks: listNotebooks() });

		case 'notebook':
			const topicId = url.searchParams.get('topicId');
			if (!topicId) {
				return json({ error: 'topicId required' }, { status: 400 });
			}
			return json({ notebook: getNotebook(topicId) });

		default:
			return json({
				available_actions: ['topics', 'extensions', 'notebooks', 'notebook'],
				description: 'Letta integration API for the Godot Learning App'
			});
	}
};

// POST - Letta can add content
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { action } = body;

	switch (action) {
		case 'add_resource': {
			const { topicId, title, url, type } = body;
			if (!topicId || !title || !url || !type) {
				return json({ error: 'Missing required fields: topicId, title, url, type' }, { status: 400 });
			}
			// Validate topic exists
			const topic = topics.find(t => t.id === topicId);
			if (!topic) {
				return json({ error: `Topic '${topicId}' not found` }, { status: 404 });
			}
			const extension = addResourceToTopic(topicId, { title, url, type }, 'ai');
			return json({
				success: true,
				message: `Added resource "${title}" to topic "${topic.title}"`,
				extension
			});
		}

		case 'add_code_example': {
			const { topicId, title, language, code, explanation } = body;
			if (!topicId || !title || !language || !code || !explanation) {
				return json({ error: 'Missing required fields: topicId, title, language, code, explanation' }, { status: 400 });
			}
			const topic = topics.find(t => t.id === topicId);
			if (!topic) {
				return json({ error: `Topic '${topicId}' not found` }, { status: 404 });
			}
			const extension = addCodeExampleToTopic(topicId, { title, language, code, explanation }, 'ai');
			return json({
				success: true,
				message: `Added code example "${title}" to topic "${topic.title}"`,
				extension
			});
		}

		default:
			return json({
				error: 'Unknown action',
				available_actions: ['add_resource', 'add_code_example']
			}, { status: 400 });
	}
};
