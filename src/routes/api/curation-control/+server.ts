import { json } from '@sveltejs/kit';
import {
	getRecentAgentActivity,
	getNotifications,
	analyzeContentGaps,
	getSettings,
	getUsageStats,
	resetUsageStats
} from '$lib/server/storage';
import { topics } from '$lib/data/topics';
import { LETTA_URL, getGideonAgentId, getCuratorAgentId } from '$lib/server/letta';
import type { RequestHandler } from './$types';

// Global curation state
let curationState = {
	running: false,
	paused: false,
	lastRun: null as string | null,
	currentTopic: null as string | null,
	totalRuns: 0,
	errors: [] as Array<{ timestamp: string; message: string }>,
	intervalId: null as ReturnType<typeof setInterval> | null
};

// GET - Get curation status and telemetry
export const GET: RequestHandler = async () => {
	const settings = getSettings();
	const agentIds = {
		gideon: getGideonAgentId(),
		curator: getCuratorAgentId()
	};

	// Check Letta availability
	let lettaAvailable = false;
	try {
		const response = await fetch(`${LETTA_URL}/v1/health`, { method: 'GET' });
		lettaAvailable = response.ok;
	} catch {
		lettaAvailable = false;
	}

	// Get recent activity
	const recentActivity = getRecentAgentActivity(10);

	// Get notification stats
	const notifications = getNotifications();
	const unseenCount = notifications.notifications.filter(n => !n.seen).length;

	// Get usage/cost stats
	const usageStats = getUsageStats();

	// Analyze content gaps summary
	const allTopicIds = topics.map(t => t.id);
	const gapsAnalysis = allTopicIds.map(id => analyzeContentGaps(id));
	const gapsSummary = {
		high: gapsAnalysis.filter(g => g.priority === 'high').length,
		medium: gapsAnalysis.filter(g => g.priority === 'medium').length,
		low: gapsAnalysis.filter(g => g.priority === 'low').length
	};

	return json({
		status: {
			running: curationState.running,
			paused: curationState.paused,
			lastRun: curationState.lastRun,
			currentTopic: curationState.currentTopic,
			totalRuns: curationState.totalRuns
		},
		config: {
			hasApiKey: !!settings.apiKey,
			model: settings.model,
			lettaAvailable,
			agents: agentIds
		},
		telemetry: {
			recentActivity,
			notifications: {
				total: notifications.notifications.length,
				unseen: unseenCount
			},
			contentGaps: gapsSummary,
			topicsNeedingWork: gapsAnalysis
				.filter(g => g.priority !== 'low')
				.map(g => ({ topicId: g.topicId, priority: g.priority, recommendations: g.recommendations }))
		},
		usage: {
			totalCost: usageStats.totalCost,
			todayCost: usageStats.todayCost,
			totalInputTokens: usageStats.totalInputTokens,
			totalOutputTokens: usageStats.totalOutputTokens,
			recentEntries: usageStats.entries.slice(0, 10),
			sessionStart: usageStats.sessionStart
		},
		errors: curationState.errors.slice(0, 5)
	});
};

// POST - Control curation (start/stop/pause)
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { action, intervalMinutes = 2 } = body;

	switch (action) {
		case 'start':
			if (curationState.running && !curationState.paused) {
				return json({ message: 'Curation already running' });
			}
			curationState.running = true;
			curationState.paused = false;
			return json({
				success: true,
				message: 'Curation started',
				status: curationState
			});

		case 'pause':
			if (!curationState.running) {
				return json({ message: 'Curation not running' });
			}
			curationState.paused = true;
			return json({
				success: true,
				message: 'Curation paused',
				status: curationState
			});

		case 'resume':
			if (!curationState.running) {
				return json({ message: 'Curation not running' });
			}
			curationState.paused = false;
			return json({
				success: true,
				message: 'Curation resumed',
				status: curationState
			});

		case 'stop':
			curationState.running = false;
			curationState.paused = false;
			curationState.currentTopic = null;
			return json({
				success: true,
				message: 'Curation stopped',
				status: curationState
			});

		case 'trigger':
			// Manual trigger for a specific topic
			const topicId = body.topicId;
			if (!topicId) {
				return json({ error: 'topicId required for trigger' }, { status: 400 });
			}
			curationState.currentTopic = topicId;
			curationState.lastRun = new Date().toISOString();
			curationState.totalRuns++;

			// This would trigger the actual curation (handled by fill-gaps or curate endpoint)
			return json({
				success: true,
				message: `Triggered curation for ${topicId}`,
				status: curationState
			});

		case 'reset-usage':
			resetUsageStats();
			return json({
				success: true,
				message: 'Usage stats reset'
			});

		default:
			return json({ error: 'Unknown action. Use: start, pause, resume, stop, trigger, reset-usage' }, { status: 400 });
	}
};
