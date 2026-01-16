import { json } from '@sveltejs/kit';
import { getSettings, saveSettings } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const settings = getSettings();
	// Don't expose full API key, just indicate if it's set
	return json({
		hasApiKey: !!settings.apiKey,
		apiKeyPreview: settings.apiKey ? `${settings.apiKey.slice(0, 10)}...` : null,
		model: settings.model
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const settings = saveSettings(body);
	return json({
		hasApiKey: !!settings.apiKey,
		apiKeyPreview: settings.apiKey ? `${settings.apiKey.slice(0, 10)}...` : null,
		model: settings.model
	});
};
