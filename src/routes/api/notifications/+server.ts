import { json } from '@sveltejs/kit';
import {
	getNotifications,
	getRecentNotifications,
	getUnseenCount,
	markNotificationsSeen,
	saveNotifications
} from '$lib/server/storage';
import type { RequestHandler } from './$types';

// GET - Get notifications and unseen count
export const GET: RequestHandler = async ({ url }) => {
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const countOnly = url.searchParams.get('countOnly') === 'true';

	if (countOnly) {
		return json({
			unseenCount: getUnseenCount()
		});
	}

	const notifications = getRecentNotifications(limit);
	const unseenCount = getUnseenCount();

	return json({
		notifications,
		unseenCount,
		total: getNotifications().notifications.length
	});
};

// POST - Mark notifications as seen
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const { action } = body;

	if (action === 'markSeen') {
		markNotificationsSeen();
		return json({
			success: true,
			message: 'All notifications marked as seen'
		});
	}

	if (action === 'clear') {
		saveNotifications({ notifications: [], lastSeen: new Date().toISOString() });
		return json({
			success: true,
			message: 'All notifications cleared'
		});
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};
