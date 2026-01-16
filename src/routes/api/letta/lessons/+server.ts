import { json } from '@sveltejs/kit';
import {
	addLesson,
	getLesson,
	getLessonsForTopic,
	getAllLessons,
	deleteLesson,
	logAgentActivity
} from '$lib/server/storage';
import { topics } from '$lib/data/topics';
import type { RequestHandler } from './$types';

// GET - Retrieve lessons
export const GET: RequestHandler = async ({ url }) => {
	const topicId = url.searchParams.get('topicId');
	const lessonId = url.searchParams.get('lessonId');

	// Get a specific lesson
	if (topicId && lessonId) {
		const lesson = getLesson(topicId, lessonId);
		if (!lesson) {
			return json({ error: 'Lesson not found' }, { status: 404 });
		}
		return json({ lesson });
	}

	// Get all lessons for a topic
	if (topicId) {
		const lessons = getLessonsForTopic(topicId);
		return json({ topicId, lessons, count: lessons.length });
	}

	// Get all lessons across all topics
	const allLessons = getAllLessons();
	const totalCount = Object.values(allLessons).reduce((sum, arr) => sum + arr.length, 0);
	return json({
		lessons: allLessons,
		totalCount,
		topicCount: Object.keys(allLessons).length
	});
};

// POST - Create a new lesson
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { topicId, title, difficulty, content, generatedFor } = body;

	// Validate required fields
	if (!topicId || typeof topicId !== 'string') {
		return json({ error: 'topicId is required' }, { status: 400 });
	}
	if (!title || typeof title !== 'string') {
		return json({ error: 'title is required' }, { status: 400 });
	}
	if (!difficulty || !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
		return json({ error: 'difficulty must be beginner, intermediate, or advanced' }, { status: 400 });
	}
	if (!content || typeof content !== 'object') {
		return json({ error: 'content object is required' }, { status: 400 });
	}

	// Validate topic exists
	const topic = topics.find(t => t.id === topicId);
	if (!topic) {
		return json({ error: `Topic '${topicId}' not found` }, { status: 404 });
	}

	// Validate content structure
	const { introduction, concepts, explanation, exercises, connections } = content;
	if (!introduction || typeof introduction !== 'string') {
		return json({ error: 'content.introduction is required' }, { status: 400 });
	}
	if (!Array.isArray(concepts)) {
		return json({ error: 'content.concepts must be an array' }, { status: 400 });
	}
	if (!explanation || typeof explanation !== 'string') {
		return json({ error: 'content.explanation is required' }, { status: 400 });
	}

	try {
		const lesson = addLesson(topicId, {
			topicId,
			title,
			difficulty,
			content: {
				introduction,
				concepts: concepts || [],
				explanation,
				exercises: exercises || [],
				connections: connections || []
			},
			generatedFor: generatedFor || 'Unknown trigger'
		});

		// Log the activity
		logAgentActivity({
			type: 'add_lesson',
			details: `Generated lesson "${title}" for topic "${topic.title}"`,
			topicId,
			agentName: 'curator'
		});

		return json({
			success: true,
			message: `Created lesson "${title}" for topic "${topic.title}"`,
			lesson
		});
	} catch (error) {
		return json({
			error: 'Failed to create lesson',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// DELETE - Remove a lesson
export const DELETE: RequestHandler = async ({ url }) => {
	const topicId = url.searchParams.get('topicId');
	const lessonId = url.searchParams.get('lessonId');

	if (!topicId || !lessonId) {
		return json({ error: 'topicId and lessonId are required' }, { status: 400 });
	}

	const deleted = deleteLesson(topicId, lessonId);
	if (!deleted) {
		return json({ error: 'Lesson not found' }, { status: 404 });
	}

	return json({ success: true, message: `Deleted lesson ${lessonId}` });
};
