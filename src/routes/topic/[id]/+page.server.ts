import { getTopicExtension, getLessonsForTopic, getAgentActivityForTopic, getProgress } from '$lib/server/storage';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

const INTERNAL_URL = env.INTERNAL_URL ?? 'http://localhost:5999';

// Trigger background curation when user visits a topic
async function triggerBackgroundCuration(topicId: string) {
	try {
		// Fire and forget - don't await, let it run in background
		fetch(`${INTERNAL_URL}/api/letta/curate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				mode: 'topic',
				topicId,
				background: true
			})
		}).catch(() => {
			// Silently ignore errors - this is background work
		});
	} catch {
		// Ignore errors for background tasks
	}
}

export const load: PageServerLoad = async ({ params }) => {
	const topicId = params.id;
	const extension = getTopicExtension(topicId);
	const lessons = getLessonsForTopic(topicId);
	const recentActivity = getAgentActivityForTopic(topicId, 5);
	const progress = getProgress();
	const topicProgress = progress.topics[topicId] || {
		completed: false,
		exercisesCompleted: [],
		lastVisited: null,
		notes: ''
	};

	// Trigger background curation for this topic (non-blocking)
	triggerBackgroundCuration(topicId);

	return {
		extension,
		lessons,
		recentActivity,
		serverProgress: topicProgress
	};
};
