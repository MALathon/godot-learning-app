/**
 * Shared Letta configuration and utilities.
 * Centralizes agent ID loading and Letta URL configuration.
 */

import { env } from '$env/dynamic/private';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const LETTA_URL = env.LETTA_URL ?? 'http://localhost:8283';
export const INTERNAL_URL = env.INTERNAL_URL ?? 'http://localhost:5999';

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
		return response.ok;
	} catch {
		return false;
	}
}
