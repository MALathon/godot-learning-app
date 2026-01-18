/**
 * Shared Letta configuration and utilities.
 * Centralizes agent ID loading and Letta URL configuration.
 */

import { env } from '$env/dynamic/private';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const LETTA_URL = env.LETTA_URL ?? 'http://localhost:8283';
// INTERNAL_URL must be set via environment variable - no hardcoded port
export const INTERNAL_URL = env.INTERNAL_URL ?? (() => {
	console.warn('INTERNAL_URL not set. Set it to your dev server URL (e.g., http://localhost:5173)');
	return 'http://localhost:5173';
})();

/**
 * Validate that a URL is safe for internal requests (SSRF protection).
 * Only allows localhost and 127.0.0.1 for internal URLs.
 */
export function isValidInternalUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const allowedHosts = ['localhost', '127.0.0.1'];
		return allowedHosts.includes(parsed.hostname);
	} catch {
		return false;
	}
}

// Validate INTERNAL_URL at module load time
if (!isValidInternalUrl(INTERNAL_URL)) {
	console.warn(`INTERNAL_URL "${INTERNAL_URL}" is not a valid localhost URL. This may pose a security risk.`);
}

export interface AgentIds {
	gideon?: string;
	curator?: string;
	sleeptime?: string;
	shared_blocks?: {
		learning_progress?: string;
		curated_content?: string;
	};
}

/**
 * Load agent IDs from the letta folder configuration files.
 * Checks agent_ids.json first, then falls back to legacy agent_id.txt.
 *
 * @returns Object containing agent IDs, or empty object if no agents configured
 */
export function getAgentIds(): AgentIds {
	const agentIdsPath = join(process.cwd(), 'letta', 'agent_ids.json');
	const legacyPath = join(process.cwd(), 'letta', 'agent_id.txt');

	if (existsSync(agentIdsPath)) {
		try {
			const data = readFileSync(agentIdsPath, 'utf-8');
			return JSON.parse(data);
		} catch (error) {
			// File exists but cannot be read/parsed - log configuration error
			console.error(
				`Failed to read agent_ids.json: ${error instanceof Error ? error.message : error}`
			);
			// Don't silently fall through - the user needs to know their config is broken
		}
	}

	if (existsSync(legacyPath)) {
		try {
			const gideonId = readFileSync(legacyPath, 'utf-8').trim();
			return { gideon: gideonId };
		} catch (error) {
			console.error(
				`Failed to read legacy agent_id.txt: ${error instanceof Error ? error.message : error}`
			);
		}
	}

	return {};
}

/**
 * Get the Gideon (chat) agent ID.
 * @returns Agent ID string or null if not configured
 */
export function getGideonAgentId(): string | null {
	const ids = getAgentIds();
	return ids.gideon || null;
}

/**
 * Get the Curator agent ID.
 * @returns Agent ID string or null if not configured
 */
export function getCuratorAgentId(): string | null {
	const ids = getAgentIds();
	return ids.curator || null;
}

/**
 * Check if Letta server is available.
 * @returns Promise resolving to true if server responds to health check
 */
export async function isLettaAvailable(): Promise<boolean> {
	try {
		const response = await fetch(`${LETTA_URL}/v1/health`, { method: 'GET' });
		if (!response.ok) {
			console.debug(`Letta health check failed with status ${response.status}`);
		}
		return response.ok;
	} catch (error) {
		console.debug(`Letta health check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return false;
	}
}

/**
 * Trigger background curation for a topic (fire-and-forget with error logging).
 * Shared utility for topic visits and post-conversation curation.
 * Now uses gap analysis to intelligently fill missing content.
 */
export function triggerBackgroundCuration(topicId: string, trigger: string = 'topic_visit'): void {
	if (!isValidInternalUrl(INTERNAL_URL)) {
		console.error(`Cannot trigger curation: INTERNAL_URL "${INTERNAL_URL}" is not a valid localhost URL`);
		return;
	}

	// Use the new gap-filling endpoint which analyzes and fills intelligently
	fetch(`${INTERNAL_URL}/api/content/fill-gaps`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			topicId,
			mode: 'single',
			background: true,
			trigger
		})
	})
		.then((response) => {
			if (!response.ok) {
				console.error(`Background gap filling failed for topic ${topicId}: HTTP ${response.status}`);
			}
		})
		.catch((error) => {
			console.error(`Background gap filling trigger failed for topic ${topicId}:`, error.message);
		});
}
