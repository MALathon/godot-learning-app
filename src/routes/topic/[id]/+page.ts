import { topics } from '$lib/data/topics';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params, data }) => {
	const topic = topics.find(t => t.id === params.id);

	if (!topic) {
		throw error(404, 'Topic not found');
	}

	const currentIndex = topics.findIndex(t => t.id === params.id);
	const prevTopic = currentIndex > 0 ? topics[currentIndex - 1] : null;
	const nextTopic = currentIndex < topics.length - 1 ? topics[currentIndex + 1] : null;

	// Merge server load data with universal load data
	return {
		...data,  // Include server load data (extension, lessons, generatedContent, etc.)
		topic,
		prevTopic,
		nextTopic
	};
};
