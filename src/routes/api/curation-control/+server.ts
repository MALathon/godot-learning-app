import { json } from '@sveltejs/kit';
import {
	getRecentAgentActivity,
	getNotifications,
	analyzeContentGaps,
	getSettings,
	getUsageStats,
	resetUsageStats,
	getTopicContent,
	logAgentActivity
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
	intervalId: null as ReturnType<typeof setInterval> | null,
	lastActivity: null as string | null
};

// Internal URL for server-to-server calls
const INTERNAL_URL = process.env.INTERNAL_URL || 'http://localhost:5173';

// Run a single curation cycle
async function runCurationCycle() {
	if (!curationState.running || curationState.paused) {
		return;
	}

	const settings = getSettings();
	if (!settings.apiKey) {
		curationState.errors.unshift({
			timestamp: new Date().toISOString(),
			message: 'No API key configured'
		});
		return;
	}

	try {
		// 1. Find topics that need prose content
		const topicsWithoutProse = topics.filter(t => !getTopicContent(t.id));

		if (topicsWithoutProse.length > 0) {
			// Generate prose for a topic that doesn't have it
			const topic = topicsWithoutProse[0];
			curationState.currentTopic = topic.id;
			curationState.lastActivity = `Generating prose for ${topic.title}`;

			logAgentActivity({
				type: 'curation',
				details: `Auto-generating prose for: ${topic.title}`,
				topicId: topic.id,
				agentName: 'curator'
			});

			const response = await fetch(`${INTERNAL_URL}/api/content/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topicId: topic.id, regenerate: false })
			});

			if (response.ok) {
				const data = await response.json();
				curationState.lastRun = new Date().toISOString();
				curationState.totalRuns++;
				curationState.lastActivity = `Generated ${data.sectionsCount || 0} sections for ${topic.title}`;
			} else {
				const error = await response.json();
				curationState.errors.unshift({
					timestamp: new Date().toISOString(),
					message: `Prose generation failed: ${error.error || 'Unknown error'}`
				});
			}
			return;
		}

		// 2. Find topics with content gaps and curate them
		const gapsAnalysis = topics.map(t => ({
			topic: t,
			gaps: analyzeContentGaps(t.id)
		})).filter(g => g.gaps.priority !== 'low');

		if (gapsAnalysis.length > 0) {
			// Pick a random topic that needs work
			const randomIndex = Math.floor(Math.random() * gapsAnalysis.length);
			const { topic, gaps } = gapsAnalysis[randomIndex];

			curationState.currentTopic = topic.id;
			curationState.lastActivity = `Curating ${topic.title} (${gaps.priority} priority)`;

			logAgentActivity({
				type: 'curation',
				details: `Auto-curating: ${topic.title} - ${gaps.recommendations[0] || 'general curation'}`,
				topicId: topic.id,
				agentName: 'curator'
			});

			// Call Letta curate endpoint
			const response = await fetch(`${INTERNAL_URL}/api/letta/curate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: 'generate', topicId: topic.id })
			});

			if (response.ok) {
				curationState.lastRun = new Date().toISOString();
				curationState.totalRuns++;
				curationState.lastActivity = `Curated ${topic.title}`;
			} else {
				// Letta might not be available, that's OK
				curationState.lastActivity = `Skipped Letta curation (not available)`;
			}
			return;
		}

		// 3. All topics are well-curated, just idle
		curationState.currentTopic = null;
		curationState.lastActivity = 'All topics up to date';

	} catch (error) {
		curationState.errors.unshift({
			timestamp: new Date().toISOString(),
			message: error instanceof Error ? error.message : 'Unknown error'
		});
		// Keep only last 10 errors
		if (curationState.errors.length > 10) {
			curationState.errors = curationState.errors.slice(0, 10);
		}
	}
}

// Start the curation loop
function startCurationLoop(intervalMinutes: number = 2) {
	if (curationState.intervalId) {
		clearInterval(curationState.intervalId);
	}

	// Run immediately
	runCurationCycle();

	// Then run on interval
	curationState.intervalId = setInterval(runCurationCycle, intervalMinutes * 60 * 1000);
}

// Stop the curation loop
function stopCurationLoop() {
	if (curationState.intervalId) {
		clearInterval(curationState.intervalId);
		curationState.intervalId = null;
	}
}

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
			startCurationLoop(intervalMinutes);
			return json({
				success: true,
				message: `Curation started (interval: ${intervalMinutes} min)`,
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
			// Run immediately on resume
			runCurationCycle();
			return json({
				success: true,
				message: 'Curation resumed',
				status: curationState
			});

		case 'stop':
			stopCurationLoop();
			curationState.running = false;
			curationState.paused = false;
			curationState.currentTopic = null;
			curationState.lastActivity = null;
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

			// Actually run curation for this topic
			try {
				const response = await fetch(`${INTERNAL_URL}/api/letta/curate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ mode: 'generate', topicId })
				});
				const result = await response.json();
				return json({
					success: true,
					message: `Triggered curation for ${topicId}`,
					status: curationState,
					result
				});
			} catch (error) {
				return json({
					success: true,
					message: `Triggered curation for ${topicId} (Letta unavailable)`,
					status: curationState
				});
			}

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
