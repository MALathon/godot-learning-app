import { getTopicExtension, getLessonsForTopic, getAgentActivityForTopic, getProgress, getTopicContent } from '$lib/server/storage';
import { triggerBackgroundCuration } from '$lib/server/letta';
import type { PageServerLoad } from './$types';

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

	// Load AI-generated content if available
	const generatedContent = getTopicContent(topicId);

	// Trigger background curation for this topic (non-blocking)
	triggerBackgroundCuration(topicId, 'topic_visit');

	return {
		extension,
		lessons,
		recentActivity,
		serverProgress: topicProgress,
		generatedContent
	};
};
