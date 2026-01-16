import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Playwright global setup - runs before all tests.
 * Verifies that Letta agents are configured.
 */
async function globalSetup() {
	const agentIdsPath = join(process.cwd(), 'letta', 'agent_ids.json');

	console.log('\n🔍 Checking Letta agent configuration...');

	if (!existsSync(agentIdsPath)) {
		console.error('\n❌ Agent IDs not found!');
		console.error('   Run: cd letta && python setup_agents.py');
		console.error('   Then restart the tests.\n');
		process.exit(1);
	}

	try {
		const agentIds = JSON.parse(readFileSync(agentIdsPath, 'utf-8'));

		if (!agentIds.gideon) {
			console.error('\n❌ Gideon agent not configured!');
			console.error('   Run: cd letta && python setup_agents.py\n');
			process.exit(1);
		}

		console.log('✅ Gideon agent:', agentIds.gideon);
		if (agentIds.curator) {
			console.log('✅ Curator agent:', agentIds.curator);
		}

		// Wait for Letta server to be ready
		console.log('\n⏳ Waiting for Letta server...');
		const maxRetries = 30;
		let retries = 0;

		while (retries < maxRetries) {
			try {
				const response = await fetch('http://localhost:8283/v1/health');
				if (response.ok) {
					console.log('✅ Letta server is ready\n');
					return;
				}
			} catch {
				// Server not ready yet
			}
			retries++;
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		console.error('\n❌ Letta server not responding after 30 seconds');
		console.error('   Make sure letta server is running\n');
		process.exit(1);
	} catch (error) {
		console.error('\n❌ Error reading agent configuration:', error);
		process.exit(1);
	}
}

export default globalSetup;
