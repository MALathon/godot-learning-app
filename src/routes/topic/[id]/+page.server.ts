import { getTopicExtension, getLessonsForTopic, getAgentActivityForTopic, getProgress } from '$lib/server/storage';
import { INTERNAL_URL } from '$lib/server/letta';
import type { PageServerLoad } from './$types';

// Trigger background curation when user visits a topic
function triggerBackgroundCuration(topicId: string): void {
	// Fire and forget - but log failures for observability
	fetch(`${INTERNAL_URL}/api/letta/curate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			mode: 'topic',
			topicId,
			background: true
		})
	}).catch((error) => {
		console.error(`Background curation trigger failed for topic ${topicId}:`, error.message);
	});
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
