import { json } from '@sveltejs/kit';
import { getSettings } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const settings = getSettings();

	if (!settings.apiKey) {
		return json({ models: [], error: 'No API key configured' }, { status: 400 });
	}

	try {
		const response = await fetch('https://api.anthropic.com/v1/models', {
			headers: {
				'x-api-key': settings.apiKey,
				'anthropic-version': '2023-06-01'
			}
		});

		if (!response.ok) {
			const error = await response.json();
			return json({ models: [], error: error.error?.message || 'Failed to fetch models' }, { status: response.status });
		}

		const data = await response.json();

		// Filter to chat models and sort by creation date (newest first)
		const chatModels = data.data
			.filter((m: { type: string }) => m.type === 'model')
			.map((m: { id: string; display_name: string; created_at: string }) => ({
				id: m.id,
				name: m.display_name,
				createdAt: m.created_at
			}));

		return json({ models: chatModels });
	} catch (error) {
		console.error('Failed to fetch models:', error);
		return json({ models: [], error: 'Failed to fetch models' }, { status: 500 });
	}
};
