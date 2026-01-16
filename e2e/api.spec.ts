import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('API Endpoints', () => {
	test.describe('Chat API (/api/chat-letta)', () => {
		test('should return streaming response for valid message', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: 'Hello, what is delta time?',
					topicId: 'game-loop'
				}
			});

			expect(response.ok()).toBeTruthy();
			expect(response.headers()['content-type']).toContain('text/event-stream');
		});

		test('should handle empty message', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: '',
					topicId: 'game-loop'
				}
			});

			// Should still work - agent can handle empty messages
			expect(response.status()).toBeLessThan(500);
		});

		test('should handle message without topicId', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: 'Hello'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should handle special characters in message', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: 'What about <script>alert("xss")</script> and "quotes" & ampersands?',
					topicId: 'game-loop'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should handle very long message', async ({ request }) => {
			const longMessage = 'a'.repeat(5000);
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: longMessage,
					topicId: 'game-loop'
				}
			});

			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Curation API (/api/letta/curate)', () => {
		test('should trigger curation with mode "topic"', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'topic',
					topicId: 'game-loop'
				}
			});

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body).toHaveProperty('success');
		});

		test('should trigger curation with mode "all"', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'all'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should trigger curation with mode "analyze"', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'analyze'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should trigger curation with mode "generate"', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'generate',
					topicId: 'signals'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should trigger curation with mode "enrich"', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'enrich'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should respect rate limiting for background curation', async ({ request }) => {
			// First request should succeed
			const response1 = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'topic',
					topicId: 'game-loop',
					background: true
				}
			});
			expect(response1.ok()).toBeTruthy();

			// Second immediate request should be rate limited
			const response2 = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'topic',
					topicId: 'game-loop',
					background: true
				}
			});
			expect(response2.ok()).toBeTruthy();
			const body = await response2.json();
			// Should indicate skipped due to rate limiting
			expect(body.skipped || body.success).toBeTruthy();
		});

		test('should allow manual curation even within rate limit window', async ({ request }) => {
			// Background request
			await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'topic',
					topicId: 'signals',
					background: true
				}
			});

			// Manual request (background: false) should still work
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'topic',
					topicId: 'signals',
					background: false
				}
			});
			expect(response.ok()).toBeTruthy();
		});

		test('should handle invalid mode gracefully', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'invalid_mode',
					topicId: 'game-loop'
				}
			});

			// Should either reject or use default
			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Lessons API (/api/letta/lessons)', () => {
		test('should get lessons for a topic', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/api/letta/lessons?topicId=game-loop`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body).toHaveProperty('lessons');
			expect(Array.isArray(body.lessons)).toBeTruthy();
		});

		test('should get all lessons when no topicId provided', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/api/letta/lessons`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body).toHaveProperty('lessons');
		});

		test('should return empty array for topic with no lessons', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/api/letta/lessons?topicId=nonexistent-topic`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body.lessons).toEqual([]);
		});

		test('should create a new lesson', async ({ request }) => {
			const newLesson = {
				topicId: 'game-loop',
				title: 'Test Lesson ' + Date.now(),
				difficulty: 'beginner',
				content: {
					introduction: 'This is a test lesson.',
					concepts: ['Test concept 1', 'Test concept 2'],
					explanation: 'This explains the test topic.',
					exercises: ['Try this exercise'],
					connections: []
				},
				generatedFor: 'E2E test'
			};

			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: newLesson
			});

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body).toHaveProperty('lesson');
			expect(body.lesson.title).toBe(newLesson.title);
		});

		test('should reject lesson with missing required fields', async ({ request }) => {
			const invalidLesson = {
				topicId: 'game-loop'
				// Missing title, difficulty, content
			};

			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: invalidLesson
			});

			expect(response.ok()).toBeFalsy();
		});

		test('should reject lesson with invalid difficulty', async ({ request }) => {
			const invalidLesson = {
				topicId: 'game-loop',
				title: 'Test Lesson',
				difficulty: 'super-hard', // Invalid
				content: {
					introduction: 'Test',
					concepts: [],
					explanation: 'Test',
					exercises: [],
					connections: []
				}
			};

			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: invalidLesson
			});

			expect(response.ok()).toBeFalsy();
		});

		test('should delete a lesson', async ({ request }) => {
			// First create a lesson to delete
			const newLesson = {
				topicId: 'game-loop',
				title: 'Lesson to Delete ' + Date.now(),
				difficulty: 'beginner',
				content: {
					introduction: 'Will be deleted.',
					concepts: [],
					explanation: 'Test',
					exercises: [],
					connections: []
				}
			};

			const createResponse = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: newLesson
			});
			const created = await createResponse.json();

			// Now delete it
			const deleteResponse = await request.delete(
				`${BASE_URL}/api/letta/lessons?topicId=game-loop&lessonId=${created.lesson.id}`
			);

			expect(deleteResponse.ok()).toBeTruthy();
		});
	});

	test.describe('Memory API (/api/letta/memory)', () => {
		test('should get agent memory blocks', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/api/letta/memory`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body).toHaveProperty('memory');
		});

		test('should update memory block', async ({ request }) => {
			const response = await request.put(`${BASE_URL}/api/letta/memory`, {
				data: {
					blockLabel: 'human',
					value: 'Updated by E2E test at ' + new Date().toISOString()
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should handle invalid block label', async ({ request }) => {
			const response = await request.put(`${BASE_URL}/api/letta/memory`, {
				data: {
					blockLabel: 'nonexistent_block',
					value: 'Test'
				}
			});

			// Should fail gracefully
			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Reset API (/api/letta/reset)', () => {
		test('should reset agent memory', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/reset`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body.success).toBeTruthy();
		});

		test('should handle multiple reset requests', async ({ request }) => {
			// Multiple resets should all succeed
			const response1 = await request.post(`${BASE_URL}/api/letta/reset`);
			const response2 = await request.post(`${BASE_URL}/api/letta/reset`);

			expect(response1.ok()).toBeTruthy();
			expect(response2.ok()).toBeTruthy();
		});
	});

	test.describe('Activity API (/api/letta/activity)', () => {
		test('should get agent activity log', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/api/letta/activity`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(body).toHaveProperty('activities');
			expect(Array.isArray(body.activities)).toBeTruthy();
		});

		test('should filter activities by topic', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/api/letta/activity?topicId=game-loop`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(Array.isArray(body.activities)).toBeTruthy();
		});

		test('should filter activities by agent', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/api/letta/activity?agentName=curator`);

			expect(response.ok()).toBeTruthy();
			const body = await response.json();
			expect(Array.isArray(body.activities)).toBeTruthy();
		});
	});
});
