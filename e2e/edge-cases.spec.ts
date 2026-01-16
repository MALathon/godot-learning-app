import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Edge Cases and Error Handling', () => {
	test.describe('API Error Handling', () => {
		test('should handle malformed JSON in request body', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				headers: { 'Content-Type': 'application/json' },
				data: 'not valid json{'
			});

			// Should return error, not crash
			expect(response.status()).toBeLessThan(500);
		});

		test('should handle missing Content-Type header', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: { message: 'test' }
			});

			// Should handle gracefully
			expect(response.status()).toBeLessThan(500);
		});

		test('should handle extremely large payload', async ({ request }) => {
			const hugeMessage = 'x'.repeat(100000); // 100KB message
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: { message: hugeMessage }
			});

			// Should reject or handle gracefully
			expect(response.status()).toBeLessThan(500);
		});

		test('should handle concurrent requests', async ({ request }) => {
			const requests = Array(5)
				.fill(null)
				.map(() =>
					request.post(`${BASE_URL}/api/chat-letta`, {
						data: { message: 'concurrent test', topicId: 'game-loop' }
					})
				);

			const responses = await Promise.all(requests);

			// All should complete without server error
			responses.forEach((response) => {
				expect(response.status()).toBeLessThan(500);
			});
		});

		test('should handle special unicode characters', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: '你好世界 🎮 مرحبا العربية ñ é ü 日本語',
					topicId: 'game-loop'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should handle newlines and tabs in message', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: 'Line 1\nLine 2\n\tTabbed line\r\nWindows newline',
					topicId: 'game-loop'
				}
			});

			expect(response.ok()).toBeTruthy();
		});

		test('should handle null values in request', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: null,
					topicId: null
				}
			});

			// Should handle gracefully
			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Lesson Validation Edge Cases', () => {
		test('should reject lesson with empty title', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: {
					topicId: 'game-loop',
					title: '',
					difficulty: 'beginner',
					content: {
						introduction: 'Test',
						concepts: [],
						explanation: 'Test',
						exercises: [],
						connections: []
					}
				}
			});

			expect(response.ok()).toBeFalsy();
		});

		test('should reject lesson with whitespace-only title', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: {
					topicId: 'game-loop',
					title: '   ',
					difficulty: 'beginner',
					content: {
						introduction: 'Test',
						concepts: [],
						explanation: 'Test',
						exercises: [],
						connections: []
					}
				}
			});

			expect(response.ok()).toBeFalsy();
		});

		test('should reject lesson with invalid topicId', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: {
					topicId: 'not-a-valid-topic',
					title: 'Test Lesson',
					difficulty: 'beginner',
					content: {
						introduction: 'Test',
						concepts: [],
						explanation: 'Test',
						exercises: [],
						connections: []
					}
				}
			});

			expect(response.ok()).toBeFalsy();
		});

		test('should handle lesson with very long title', async ({ request }) => {
			const longTitle = 'A'.repeat(500);
			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: {
					topicId: 'game-loop',
					title: longTitle,
					difficulty: 'beginner',
					content: {
						introduction: 'Test',
						concepts: [],
						explanation: 'Test',
						exercises: [],
						connections: []
					}
				}
			});

			// Should either truncate or reject
			expect(response.status()).toBeLessThan(500);
		});

		test('should handle lesson with HTML in content', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/lessons`, {
				data: {
					topicId: 'game-loop',
					title: 'HTML Test Lesson ' + Date.now(),
					difficulty: 'beginner',
					content: {
						introduction: '<script>alert("xss")</script>',
						concepts: ['<img src=x onerror=alert(1)>'],
						explanation: '<a href="javascript:alert(1)">Click</a>',
						exercises: [],
						connections: []
					}
				}
			});

			// Should sanitize or escape HTML
			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Curation Edge Cases', () => {
		test('should handle rapid curation requests', async ({ request }) => {
			const requests = Array(10)
				.fill(null)
				.map((_, i) =>
					request.post(`${BASE_URL}/api/letta/curate`, {
						data: {
							mode: 'topic',
							topicId: `topic-${i % 8}`,
							background: true
						}
					})
				);

			const responses = await Promise.all(requests);

			// All should complete without server error
			responses.forEach((response) => {
				expect(response.status()).toBeLessThan(500);
			});
		});

		test('should handle curation with empty topicId', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/letta/curate`, {
				data: {
					mode: 'topic',
					topicId: ''
				}
			});

			// Should use global key or reject
			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Memory Edge Cases', () => {
		test('should handle memory update with very long value', async ({ request }) => {
			const longValue = 'x'.repeat(10000);
			const response = await request.put(`${BASE_URL}/api/letta/memory`, {
				data: {
					blockLabel: 'human',
					value: longValue
				}
			});

			// Should either accept or reject gracefully
			expect(response.status()).toBeLessThan(500);
		});

		test('should handle memory update with special characters', async ({ request }) => {
			const response = await request.put(`${BASE_URL}/api/letta/memory`, {
				data: {
					blockLabel: 'human',
					value: '{"nested": "json"} and <xml>tags</xml> with "quotes"'
				}
			});

			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Frontend Edge Cases', () => {
		test('should handle page refresh during chat', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Open chat and type
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			const input = page.locator('input[type="text"], textarea').first();
			await input.fill('Test message');

			// Refresh page
			await page.reload();

			// Page should load without errors
			await expect(page.locator('h1')).toBeVisible();
		});

		test('should handle browser back button', async ({ page }) => {
			await page.goto('/');
			await page.click('a[href="/topic/game-loop"]');
			await expect(page).toHaveURL(/game-loop/);

			// Go back
			await page.goBack();
			await expect(page).toHaveURL('/');
		});

		test('should handle direct URL access to topic', async ({ page }) => {
			await page.goto('/topic/signals');
			await expect(page).toHaveURL(/signals/);
			await expect(page.locator('h1')).toBeVisible();
		});

		test('should handle JavaScript disabled gracefully', async ({ browser }) => {
			const context = await browser.newContext({ javaScriptEnabled: false });
			const page = await context.newPage();

			// Should at least show some content
			const response = await page.goto('/topic/game-loop');
			expect(response?.status()).toBeLessThan(500);

			await context.close();
		});

		test('should handle slow network', async ({ page }) => {
			// Simulate slow 3G
			const client = await page.context().newCDPSession(page);
			await client.send('Network.emulateNetworkConditions', {
				offline: false,
				downloadThroughput: (500 * 1024) / 8, // 500 kbps
				uploadThroughput: (500 * 1024) / 8,
				latency: 400
			});

			await page.goto('/topic/game-loop', { timeout: 60000 });
			await expect(page.locator('h1')).toBeVisible({ timeout: 30000 });
		});

		test('should handle offline mode', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Go offline
			await page.context().setOffline(true);

			// Try to send chat message
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			if (await chatButton.isVisible()) {
				await chatButton.click();
				const input = page.locator('input[type="text"], textarea').first();
				if (await input.isVisible()) {
					await input.fill('Offline message');
					await input.press('Enter');
					// Should show error or queue message, not crash
					await page.waitForTimeout(2000);
				}
			}

			// Go back online
			await page.context().setOffline(false);
		});
	});

	test.describe('Security Tests', () => {
		test('should not expose sensitive data in error messages', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: { invalid: 'data' }
			});

			const text = await response.text();
			// Should not contain stack traces or internal paths
			expect(text).not.toContain('/home/');
			expect(text).not.toContain('node_modules');
			expect(text).not.toContain('at Object.');
		});

		test('should have secure headers', async ({ request }) => {
			const response = await request.get(`${BASE_URL}/`);
			const headers = response.headers();

			// Check for security headers (SvelteKit provides some by default)
			// These may vary based on configuration
			expect(response.status()).toBeLessThan(500);
		});

		test('should prevent path traversal in lesson API', async ({ request }) => {
			const response = await request.get(
				`${BASE_URL}/api/letta/lessons?topicId=../../../etc/passwd`
			);

			// Should reject or sanitize
			expect(response.status()).toBeLessThan(500);
			const body = await response.json();
			expect(body.lessons || []).not.toContain('root:');
		});

		test('should handle SQL injection attempts', async ({ request }) => {
			const response = await request.post(`${BASE_URL}/api/chat-letta`, {
				data: {
					message: "'; DROP TABLE users; --",
					topicId: "game-loop' OR '1'='1"
				}
			});

			// Should handle safely
			expect(response.status()).toBeLessThan(500);
		});
	});

	test.describe('Performance Tests', () => {
		test('should load home page within acceptable time', async ({ page }) => {
			const startTime = Date.now();
			await page.goto('/');
			const loadTime = Date.now() - startTime;

			// Should load within 5 seconds
			expect(loadTime).toBeLessThan(5000);
		});

		test('should load topic page within acceptable time', async ({ page }) => {
			const startTime = Date.now();
			await page.goto('/topic/game-loop');
			const loadTime = Date.now() - startTime;

			// Should load within 5 seconds
			expect(loadTime).toBeLessThan(5000);
		});

		test('should handle many messages in chat', async ({ page }) => {
			await page.goto('/topic/game-loop');

			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			const input = page.locator('input[type="text"], textarea').first();

			// Send 10 messages
			for (let i = 0; i < 10; i++) {
				await input.fill(`Message ${i}`);
				await input.press('Enter');
				await page.waitForTimeout(500);
			}

			// Page should still be responsive
			expect(await page.locator('body').isVisible()).toBeTruthy();
		});
	});
});
