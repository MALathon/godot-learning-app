import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	fullyParallel: false, // Run tests sequentially to avoid Letta server conflicts
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: 'html',
	timeout: 60000, // 60s timeout for tests involving Letta API calls

	use: {
		baseURL: 'http://localhost:5180',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],

	webServer: [
		{
			// Letta AI server - must start first
			command: 'letta server',
			url: 'http://localhost:8283/v1/health',
			reuseExistingServer: !process.env.CI,
			timeout: 60000
		},
		{
			// SvelteKit dev server
			command: 'npm run dev -- --port 5180',
			url: 'http://localhost:5180',
			reuseExistingServer: !process.env.CI,
			timeout: 120000
		}
	]
});
