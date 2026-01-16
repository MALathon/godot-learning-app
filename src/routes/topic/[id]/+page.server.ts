import { getTopicExtension, getLessonsForTopic, getAgentActivityForTopic, getProgress } from '$lib/server/storage';
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

	return {
		extension,
		lessons,
		recentActivity,
		serverProgress: topicProgress
	};
};
