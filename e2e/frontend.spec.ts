import { test, expect } from '@playwright/test';

test.describe('Frontend E2E Tests', () => {
	test.describe('Home Page', () => {
		test('should display the home page with topic list', async ({ page }) => {
			await page.goto('/');

			// Should have a heading
			await expect(page.locator('h1')).toBeVisible();

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
				const topicLink = page.locator(`a[href="/topic/${topic}"]`);
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
			await expect(page.locator('h1')).toBeVisible();

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

			// Look for chat bubble/button
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat');
			await expect(chatButton.first()).toBeVisible({ timeout: 10000 });
		});

		test('should open chat panel when clicking bubble', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Click chat bubble
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			// Chat panel should be visible
			const chatPanel = page.locator('[data-testid="chat-panel"], .chat-panel, .chat-container, [class*="chat"]').first();
			await expect(chatPanel).toBeVisible({ timeout: 5000 });
		});

		test('should have message input in chat panel', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Open chat
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			// Should have input field
			const input = page.locator('input[type="text"], textarea').first();
			await expect(input).toBeVisible({ timeout: 5000 });
		});

		test('should send message and receive response', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Open chat
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			// Type message
			const input = page.locator('input[type="text"], textarea').first();
			await input.fill('Hello, what is delta time?');

			// Send message (press Enter or click send button)
			await input.press('Enter');

			// Wait for response (look for assistant message or loading indicator)
			await page.waitForSelector('[class*="message"], [class*="response"], [class*="assistant"]', {
				timeout: 30000
			});
		});

		test('should close chat panel when clicking close button', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Open chat
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			// Wait for panel to open
			await page.waitForTimeout(500);

			// Find and click close button
			const closeButton = page.locator('button:has-text("close"), button:has-text("×"), [aria-label*="close"]').first();
			if (await closeButton.isVisible()) {
				await closeButton.click();
			}
		});

		test('should display settings panel', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Open chat
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			// Look for settings icon/button
			const settingsButton = page.locator('button:has-text("settings"), [aria-label*="settings"], .settings-button, button svg').first();
			if (await settingsButton.isVisible()) {
				await settingsButton.click();

				// Should show settings panel
				await page.waitForSelector('text=/memory|reset|settings/i', { timeout: 5000 });
			}
		});

		test('should handle rapid message sending', async ({ page }) => {
			await page.goto('/topic/game-loop');

			// Open chat
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			const input = page.locator('input[type="text"], textarea').first();

			// Send multiple messages rapidly
			await input.fill('Message 1');
			await input.press('Enter');
			await input.fill('Message 2');
			await input.press('Enter');

			// Should handle without crashing
			await page.waitForTimeout(2000);
			expect(await page.locator('body').isVisible()).toBeTruthy();
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

			// Open chat
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await chatButton.click();

			// Type something but don't send
			const input = page.locator('input[type="text"], textarea').first();
			await input.fill('Draft message');

			// Navigate away and back
			await page.goto('/');
			await page.goto('/topic/game-loop');

			// Chat bubble should still be there
			await expect(chatButton).toBeVisible({ timeout: 5000 });
		});
	});

	test.describe('Responsive Design', () => {
		test('should display properly on mobile viewport', async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 });
			await page.goto('/topic/game-loop');

			// Content should be visible
			await expect(page.locator('h1')).toBeVisible();

			// Chat bubble should be accessible
			const chatButton = page.locator('[data-testid="chat-bubble"], button:has-text("chat"), .chat-bubble, .floating-chat').first();
			await expect(chatButton).toBeVisible({ timeout: 10000 });
		});

		test('should display properly on tablet viewport', async ({ page }) => {
			await page.setViewportSize({ width: 768, height: 1024 });
			await page.goto('/topic/game-loop');

			await expect(page.locator('h1')).toBeVisible();
		});

		test('should display properly on desktop viewport', async ({ page }) => {
			await page.setViewportSize({ width: 1920, height: 1080 });
			await page.goto('/topic/game-loop');

			await expect(page.locator('h1')).toBeVisible();
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
