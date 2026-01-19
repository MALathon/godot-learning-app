import { json } from '@sveltejs/kit';
import {
	analyzeContentGaps,
	getTopicsNeedingContent,
	logAgentActivity,
	getSettings
} from '$lib/server/storage';
import { topics } from '$lib/data/topics';
import { LETTA_URL, getCuratorAgentId, getGideonAgentId, INTERNAL_URL, isValidInternalUrl } from '$lib/server/letta';
import type { RequestHandler } from './$types';

// Track in-progress fills to avoid duplicate work
const inProgressFills = new Set<string>();
const recentFills = new Map<string, number>();
const FILL_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between fills per topic

function shouldSkipFill(topicId: string): boolean {
	if (inProgressFills.has(topicId)) {
		return true;
	}
	const lastFill = recentFills.get(topicId);
	if (lastFill && Date.now() - lastFill < FILL_COOLDOWN_MS) {
		return true;
	}
	return false;
}

async function generateProseContent(topicId: string, settings: { apiKey: string; model: string }): Promise<boolean> {
	if (!isValidInternalUrl(INTERNAL_URL)) {
		console.error('Invalid INTERNAL_URL for content generation');
		return false;
	}

	try {
		const response = await fetch(`${INTERNAL_URL}/api/content/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ topicId, regenerate: false })
		});
		return response.ok;
	} catch (error) {
		console.error(`Failed to generate prose for ${topicId}:`, error);
		return false;
	}
}

async function curateResources(topicId: string): Promise<boolean> {
	const agentId = getCuratorAgentId() || getGideonAgentId();
	if (!agentId) {
		console.log('No agent available for resource curation');
		return false;
	}

	const prompt = `
You are curating resources for the topic: ${topicId}

Your task is to ADD RESOURCES to this topic. Follow these steps:

1. Use get_current_extensions('${topicId}') to see what already exists
2. Use web_search to find HIGH-QUALITY Godot resources for this topic
3. Focus on:
   - Official Godot documentation
   - GDQuest tutorials
   - Game Programming Patterns references
   - High-quality YouTube tutorials

4. For each good resource, use add_resource with:
   - topic_id: "${topicId}"
   - title: Clear, descriptive title
   - url: The actual URL
   - type: "docs" | "video" | "book" | "source"

Add at least 2-3 high-quality resources. Do not just analyze - actually ADD them.
`.trim();

	try {
		const response = await fetch(`${LETTA_URL}/v1/agents/${agentId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
		});
		return response.ok;
	} catch (error) {
		console.error(`Failed to curate resources for ${topicId}:`, error);
		return false;
	}
}

async function generateCodeExamples(topicId: string): Promise<boolean> {
	const agentId = getCuratorAgentId() || getGideonAgentId();
	if (!agentId) {
		console.log('No agent available for code example generation');
		return false;
	}

	const topic = topics.find(t => t.id === topicId);
	if (!topic) return false;

	const prompt = `
You are generating code examples for the topic: ${topic.title} (${topicId})

Topic description: ${topic.description}
Key concepts: ${topic.keyPoints.slice(0, 3).join(', ')}

Your task is to CREATE CODE EXAMPLES. Follow these steps:

1. Use get_current_extensions('${topicId}') to see existing examples
2. Create 1-2 practical GDScript examples that demonstrate key concepts
3. For each example, use add_code_example with:
   - topic_id: "${topicId}"
   - title: What the example demonstrates
   - language: "gdscript"
   - code: Working, well-commented code
   - explanation: Step-by-step breakdown of what the code does

Focus on practical, beginner-friendly examples. Do not just analyze - actually CREATE the examples.
`.trim();

	try {
		const response = await fetch(`${LETTA_URL}/v1/agents/${agentId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
		});
		return response.ok;
	} catch (error) {
		console.error(`Failed to generate code examples for ${topicId}:`, error);
		return false;
	}
}

// POST - Fill gaps for a specific topic or all topics
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { topicId, mode = 'single', background = false } = body;

	if (mode === 'single' && !topicId) {
		return json({ error: 'topicId required for single mode' }, { status: 400 });
	}

	const settings = getSettings();

	// For 'all' mode, analyze all topics and fill gaps for high-priority ones
	if (mode === 'all') {
		const allTopicIds = topics.map(t => t.id);
		const gapsToFill = getTopicsNeedingContent(allTopicIds);

		// Limit to top 3 high-priority topics to avoid overwhelming the system
		const topPriority = gapsToFill.slice(0, 3);

		if (topPriority.length === 0) {
			return json({
				success: true,
				message: 'All topics have sufficient content',
				analyzed: allTopicIds.length
			});
		}

		// Log the analysis
		logAgentActivity({
			type: 'thinking',
			details: `Identified ${gapsToFill.length} topics needing content. Filling top ${topPriority.length}.`,
			agentName: 'curator'
		});

		// Trigger fills in background (fire-and-forget)
		for (const gap of topPriority) {
			if (!shouldSkipFill(gap.topicId)) {
				// Fire off the fill request
				fetch(`${INTERNAL_URL}/api/content/fill-gaps`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ topicId: gap.topicId, mode: 'single', background: true })
				}).catch(err => console.error(`Failed to trigger fill for ${gap.topicId}:`, err));
			}
		}

		return json({
			success: true,
			message: `Triggered gap filling for ${topPriority.length} topics`,
			topics: topPriority.map(g => ({
				topicId: g.topicId,
				priority: g.priority,
				gaps: g.gaps,
				recommendations: g.recommendations
			}))
		});
	}

	// Single topic mode
	if (shouldSkipFill(topicId)) {
		return json({
			success: true,
			skipped: true,
			message: 'Gap filling recently completed or in progress for this topic'
		});
	}

	// Analyze gaps
	const gaps = analyzeContentGaps(topicId);

	if (gaps.priority === 'low' && !Object.values(gaps.gaps).some(Boolean)) {
		return json({
			success: true,
			message: 'Topic has sufficient content',
			gaps
		});
	}

	// Mark as in-progress
	inProgressFills.add(topicId);

	// Log the fill start
	logAgentActivity({
		type: 'thinking',
		details: `Filling content gaps for: ${topicId} (${gaps.recommendations.join(', ')})`,
		topicId,
		agentName: 'curator'
	});

	const results: Record<string, boolean> = {};

	try {
		// Fill gaps in priority order
		if (gaps.gaps.needsProseContent && settings.apiKey) {
			results.proseContent = await generateProseContent(topicId, {
				apiKey: settings.apiKey,
				model: settings.model
			});
		}

		if (gaps.gaps.needsResources) {
			results.resources = await curateResources(topicId);
		}

		if (gaps.gaps.needsCodeExamples) {
			results.codeExamples = await generateCodeExamples(topicId);
		}

		// Update tracking
		recentFills.set(topicId, Date.now());

		// Log completion
		const successCount = Object.values(results).filter(Boolean).length;
		logAgentActivity({
			type: 'add_lesson',
			details: `Filled ${successCount} gap(s) for: ${topicId}`,
			topicId,
			agentName: 'curator'
		});

		return json({
			success: true,
			topicId,
			gaps,
			results,
			message: `Filled ${successCount} content gaps`
		});
	} catch (error) {
		console.error(`Error filling gaps for ${topicId}:`, error);
		return json({
			error: 'Failed to fill gaps',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	} finally {
		inProgressFills.delete(topicId);
	}
};

// GET - Analyze gaps for a topic or all topics
export const GET: RequestHandler = async ({ url }) => {
	const topicId = url.searchParams.get('topicId');
	const mode = url.searchParams.get('mode') || 'single';

	if (mode === 'all') {
		const allTopicIds = topics.map(t => t.id);
		const allGaps = allTopicIds.map(id => analyzeContentGaps(id));

		// Group by priority
		const byPriority = {
			high: allGaps.filter(g => g.priority === 'high'),
			medium: allGaps.filter(g => g.priority === 'medium'),
			low: allGaps.filter(g => g.priority === 'low')
		};

		return json({
			totalTopics: allTopicIds.length,
			byPriority: {
				high: byPriority.high.length,
				medium: byPriority.medium.length,
				low: byPriority.low.length
			},
			gaps: allGaps
		});
	}

	if (!topicId) {
		return json({ error: 'topicId query parameter required' }, { status: 400 });
	}

	const gaps = analyzeContentGaps(topicId);
	return json(gaps);
};
