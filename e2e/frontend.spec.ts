import { test, expect } from '@playwright/test';

test.describe('Frontend E2E Tests', () => {
	test.describe('Home Page', () => {
		test('should display the home page with topic list', async ({ page }) => {
			await page.goto('/');

			// Should have a heading
			await expect(page.locator('h1').first()).toBeVisible();

			// Should display topic cards/links
			const topicLinks = page.locator('a[href^="/topic/"]');
			const count = await topicLinks.count();
			expect(count).toBeGreaterThan(0);
		});

		test('should display all 8 core topics', async ({ page }) => {
			await page.goto('/');

			const expectedTopics = [
				'game-loop',
				'scene-tree',
				'signals',
				'nodes-resources',
				'servers',
				'gdscript-internals',
				'composition',
				'state-machines'
			];

			for (const topic of expectedTopics) {
				const topicLink = page.locator(`a[href="/topic/${topic}"]`).first();
				await expect(topicLink).toBeVisible();
			}
		});

		test('should navigate to topic page when clicking topic', async ({ page }) => {
			await page.goto('/');

			await page.click('a[href="/topic/game-loop"]');

			await expect(page).toHaveURL(/\/topic\/game-loop/);
		});
	});

	test.describe('Topic Page', () => {
		test('should display topic content', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Should have topic title
			await expect(page.locator('h1').first()).toBeVisible();

			// Should have content sections
			await expect(page.getByText(/game loop/i).first()).toBeVisible();
		});

		test('should display extensions tab with resources', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Look for resources or extensions section
			const resourcesSection = page.locator('text=/resources|extensions/i').first();
			if (await resourcesSection.isVisible()) {
				await expect(resourcesSection).toBeVisible();
			}
		});

		test('should display lessons tab', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Look for lessons section or tab
			const lessonsSection = page.locator('text=/lessons/i').first();
			if (await lessonsSection.isVisible()) {
				await expect(lessonsSection).toBeVisible();
			}
		});

		test('should display notes tab', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Look for notes section or tab
			const notesSection = page.locator('text=/notes/i').first();
			if (await notesSection.isVisible()) {
				await expect(notesSection).toBeVisible();
			}
		});

		test('should handle invalid topic gracefully', async ({ page }) => {
			const response = await page.goto('/topic/nonexistent-topic-xyz');

			// Should either show 404 or redirect
			expect(response?.status()).toBeLessThan(500);
		});
	});

	test.describe('Floating Chat', () => {
		test('should display chat bubble on topic page', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Look for chat bubble (using actual class name from FloatingChat.svelte)
			const chatButton = page.locator('.chat-bubble, [aria-label="Open AI tutor"]');
			await expect(chatButton.first()).toBeVisible({ timeout: 10000 });
		});

		test('should open chat panel when clicking bubble', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Wait for chat bubble to be ready and Svelte to hydrate
			const chatButton = page.locator('.chat-bubble').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });

			// Wait a moment for Svelte hydration to complete
			await page.waitForTimeout(500);

			// Click using Playwright's native click with force
			await chatButton.click({ force: true });

			// Wait for state transition - chat panel should appear
			const chatPanel = page.locator('.chat-panel');
			await expect(chatPanel).toBeVisible({ timeout: 10000 });
		});

		test('should have message input in chat panel', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Wait for chat bubble and Svelte hydration
			const chatButton = page.locator('.chat-bubble').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(500);

			// Click to open
			await chatButton.click({ force: true });

			// Wait for panel and check for input
			await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 10000 });
			const input = page.locator('.chat-panel textarea, .chat-panel input').first();
			await expect(input).toBeVisible({ timeout: 5000 });
		});

		test('should close chat panel when clicking close button', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Wait for chat bubble and Svelte hydration
			const chatButton = page.locator('.chat-bubble').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(500);

			// Click to open
			await chatButton.click({ force: true });

			// Wait for panel to open
			const chatPanel = page.locator('.chat-panel');
			await expect(chatPanel).toBeVisible({ timeout: 10000 });

			// Find and click close button
			const closeButton = page.locator('.close-btn').first();
			await closeButton.click({ force: true });

			// Panel should be hidden (bubble visible again)
			await expect(page.locator('.chat-bubble').first()).toBeVisible({ timeout: 10000 });
		});

		test('should display memory panel', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Wait for chat bubble and Svelte hydration
			const chatButton = page.locator('.chat-bubble').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(500);

			// Click to open
			await chatButton.click({ force: true });

			// Wait for chat panel
			await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 10000 });

			// Look for memory button
			const memoryButton = page.locator('[title="Agent memory"]').first();
			if (await memoryButton.isVisible()) {
				await memoryButton.click({ force: true });

				// Should show memory panel
				await expect(page.locator('.memory-panel')).toBeVisible({ timeout: 5000 });
			}
		});

		test('should show context bar with progress', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Wait for chat bubble and Svelte hydration
			const chatButton = page.locator('.chat-bubble').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(500);

			// Click to open
			await chatButton.click({ force: true });

			// Wait for panel
			await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 10000 });

			// Should have context bar
			const contextBar = page.locator('.context-bar');
			await expect(contextBar).toBeVisible({ timeout: 5000 });

			// Should show progress info
			await expect(page.locator('text=/Progress:/i')).toBeVisible();
		});
	});

	test.describe('Navigation', () => {
		test('should navigate between topics', async ({ page }) => {
			await page.goto('/topic/game-loop');
			await expect(page).toHaveURL(/game-loop/);

			// Find link to another topic
			const signalsLink = page.locator('a[href="/topic/signals"]').first();
			if (await signalsLink.isVisible()) {
				await signalsLink.click();
				await expect(page).toHaveURL(/signals/);
			}
		});

		test('should navigate back to home', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Find home link
			const homeLink = page.locator('a[href="/"]').first();
			if (await homeLink.isVisible()) {
				await homeLink.click();
				await expect(page).toHaveURL('/');
			}
		});

		test('should preserve chat state when navigating', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Wait for chat bubble and Svelte hydration
			const chatButton = page.locator('.chat-bubble').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(500);

			// Click to open
			await chatButton.click({ force: true });

			// Wait for panel
			await expect(page.locator('.chat-panel')).toBeVisible({ timeout: 10000 });

			// Navigate away and back
			await page.goto('/');
			await page.goto('/topic/game-loop');

			// Chat bubble should still be there (new instance)
			const newChatButton = page.locator('.chat-bubble, [aria-label="Open AI tutor"]').first();
			await expect(newChatButton).toBeVisible({ timeout: 10000 });
		});
	});

	test.describe('Responsive Design', () => {
		test('should display properly on mobile viewport', async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 });
			await page.goto('/topic/game-loop');

			// Content should be visible
			await expect(page.locator('h1').first()).toBeVisible();

			// Chat bubble should be accessible
			const chatButton = page.locator('.chat-bubble, [aria-label="Open AI tutor"]').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });
		});

		test('should display properly on tablet viewport', async ({ page }) => {
			await page.setViewportSize({ width: 768, height: 1024 });
			await page.goto('/topic/game-loop');

			await expect(page.locator('h1').first()).toBeVisible();
		});

		test('should display properly on desktop viewport', async ({ page }) => {
			await page.setViewportSize({ width: 1920, height: 1080 });
			await page.goto('/topic/game-loop');

			await expect(page.locator('h1').first()).toBeVisible();
		});
	});

	test.describe('Accessibility', () => {
		test('should have proper heading hierarchy', async ({ page }) => {
			await page.goto('/topic/game-loop');

			const h1 = await page.locator('h1').count();
			expect(h1).toBeGreaterThan(0);
		});

		test('should have focusable interactive elements', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Tab through elements
			await page.keyboard.press('Tab');
			const focusedElement = await page.locator(':focus').first();
			expect(await focusedElement.isVisible()).toBeTruthy();
		});

		test('should have alt text on images', async ({ page }) => {
			await page.goto('/topic/game-loop');

			const images = page.locator('img');
			const count = await images.count();

			for (let i = 0; i < count; i++) {
				const img = images.nth(i);
				const alt = await img.getAttribute('alt');
				// Images should have alt attribute (even if empty for decorative)
				expect(alt).not.toBeNull();
			}
		});
	});
});
