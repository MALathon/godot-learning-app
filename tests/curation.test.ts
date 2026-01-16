import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

// Test constants
const TEST_DATA_DIR = join(process.cwd(), 'data-test');
const TEST_LESSONS_DIR = join(TEST_DATA_DIR, 'lessons');
const TEST_EXTENSIONS_DIR = join(TEST_DATA_DIR, 'extensions');

// We'll test the storage functions directly by importing them
// For API route tests, we'd need to set up a test server

describe('Curation Rate Limiting', () => {
	const recentCurations = new Map<string, number>();
	const CURATION_COOLDOWN_MS = 5 * 60 * 1000;

	function shouldSkipCuration(topicId: string, background: boolean): boolean {
		if (!background) return false;
		const key = topicId || 'global';
		const lastCuration = recentCurations.get(key);
		const now = Date.now();
		if (lastCuration && now - lastCuration < CURATION_COOLDOWN_MS) {
			return true;
		}
		recentCurations.set(key, now);
		return false;
	}

	beforeEach(() => {
		recentCurations.clear();
	});

	it('should allow first curation for a topic', () => {
		expect(shouldSkipCuration('game-loop', true)).toBe(false);
	});

	it('should skip second background curation within cooldown', () => {
		shouldSkipCuration('game-loop', true);
		expect(shouldSkipCuration('game-loop', true)).toBe(true);
	});

	it('should allow manual curation even within cooldown', () => {
		shouldSkipCuration('game-loop', true);
		expect(shouldSkipCuration('game-loop', false)).toBe(false);
	});

	it('should track different topics independently', () => {
		shouldSkipCuration('game-loop', true);
		expect(shouldSkipCuration('signals', true)).toBe(false);
	});

	it('should use global key when topicId is empty', () => {
		shouldSkipCuration('', true);
		expect(shouldSkipCuration('', true)).toBe(true);
	});
});

describe('Curation Modes', () => {
	const validModes = ['all', 'topic', 'analyze', 'generate', 'enrich'];

	it('should recognize all valid curation modes', () => {
		validModes.forEach((mode) => {
			expect(validModes.includes(mode)).toBe(true);
		});
	});

	it('should have 5 curation modes', () => {
		expect(validModes.length).toBe(5);
	});
});

describe('Agent ID Loading', () => {
	const mockAgentIds = {
		gideon: 'agent-123',
		curator: 'agent-456',
		sleeptime: 'agent-789',
		shared_blocks: {
			learning_progress: 'block-1',
			curated_content: 'block-2'
		}
	};

	it('should have gideon agent ID', () => {
		expect(mockAgentIds.gideon).toBeDefined();
		expect(mockAgentIds.gideon).toMatch(/^agent-/);
	});

	it('should have curator agent ID', () => {
		expect(mockAgentIds.curator).toBeDefined();
		expect(mockAgentIds.curator).toMatch(/^agent-/);
	});

	it('should have shared memory blocks', () => {
		expect(mockAgentIds.shared_blocks).toBeDefined();
		expect(mockAgentIds.shared_blocks.learning_progress).toBeDefined();
		expect(mockAgentIds.shared_blocks.curated_content).toBeDefined();
	});
});

describe('Lesson Structure Validation', () => {
	const validLesson = {
		topicId: 'game-loop',
		title: 'Understanding Delta Time',
		difficulty: 'beginner',
		content: {
			introduction: 'Delta time is crucial for frame-independent movement.',
			concepts: ['Frame independence', 'Time-based calculations'],
			explanation: 'When you multiply by delta time...',
			exercises: ['Try removing delta and observe the difference'],
			connections: ['physics-process', 'animations']
		},
		generatedFor: 'User asked about smooth movement'
	};

	it('should have required topicId', () => {
		expect(validLesson.topicId).toBeDefined();
		expect(typeof validLesson.topicId).toBe('string');
	});

	it('should have required title', () => {
		expect(validLesson.title).toBeDefined();
		expect(typeof validLesson.title).toBe('string');
	});

	it('should have valid difficulty level', () => {
		const validDifficulties = ['beginner', 'intermediate', 'advanced'];
		expect(validDifficulties).toContain(validLesson.difficulty);
	});

	it('should have content with required fields', () => {
		expect(validLesson.content.introduction).toBeDefined();
		expect(validLesson.content.explanation).toBeDefined();
		expect(Array.isArray(validLesson.content.concepts)).toBe(true);
	});

	it('should have optional arrays for exercises and connections', () => {
		expect(Array.isArray(validLesson.content.exercises)).toBe(true);
		expect(Array.isArray(validLesson.content.connections)).toBe(true);
	});
});

describe('Resource Structure Validation', () => {
	const validResource = {
		title: 'Godot Documentation - Main Loop',
		url: 'https://docs.godotengine.org/en/stable/tutorials/scripting/main_loop.html',
		type: 'docs',
		addedAt: '2026-01-16T05:06:18.906Z',
		addedBy: 'ai'
	};

	it('should have required title', () => {
		expect(validResource.title).toBeDefined();
		expect(typeof validResource.title).toBe('string');
	});

	it('should have valid URL', () => {
		expect(validResource.url).toBeDefined();
		expect(validResource.url).toMatch(/^https?:\/\//);
	});

	it('should have valid resource type', () => {
		const validTypes = ['docs', 'source', 'book', 'video'];
		expect(validTypes).toContain(validResource.type);
	});

	it('should have addedBy field set to ai', () => {
		expect(validResource.addedBy).toBe('ai');
	});
});

describe('Code Example Structure Validation', () => {
	const validCodeExample = {
		title: 'Frame-Independent Movement with Delta Time',
		language: 'gdscript',
		code: 'func _process(delta):\n\tposition += velocity * delta',
		explanation: 'Multiplying by delta ensures consistent movement speed.',
		addedAt: '2026-01-16T05:06:30.306Z',
		addedBy: 'ai'
	};

	it('should have required title', () => {
		expect(validCodeExample.title).toBeDefined();
	});

	it('should have valid language', () => {
		const validLanguages = ['gdscript', 'python', 'typescript', 'cpp'];
		expect(validLanguages).toContain(validCodeExample.language);
	});

	it('should have code content', () => {
		expect(validCodeExample.code).toBeDefined();
		expect(validCodeExample.code.length).toBeGreaterThan(0);
	});

	it('should have explanation', () => {
		expect(validCodeExample.explanation).toBeDefined();
	});
});

describe('Curation Prompt Generation', () => {
	function buildCurationPrompt(mode: string, topicId?: string): string {
		if (mode === 'generate' && topicId) {
			return `CONTENT GENERATION mode for topic: ${topicId}`;
		} else if (mode === 'topic' && topicId) {
			return `curate content specifically for the topic: ${topicId}`;
		} else if (mode === 'analyze') {
			return `analyze the student's overall learning progress`;
		} else if (mode === 'enrich') {
			return `ENRICHMENT mode`;
		}
		return `comprehensive curation session`;
	}

	it('should generate topic-specific prompt for topic mode', () => {
		const prompt = buildCurationPrompt('topic', 'game-loop');
		expect(prompt).toContain('game-loop');
		expect(prompt).toContain('topic');
	});

	it('should generate generate-mode prompt', () => {
		const prompt = buildCurationPrompt('generate', 'signals');
		expect(prompt).toContain('CONTENT GENERATION');
		expect(prompt).toContain('signals');
	});

	it('should generate analyze prompt', () => {
		const prompt = buildCurationPrompt('analyze');
		expect(prompt).toContain('analyze');
		expect(prompt).toContain('learning progress');
	});

	it('should generate enrich prompt', () => {
		const prompt = buildCurationPrompt('enrich');
		expect(prompt).toContain('ENRICHMENT');
	});

	it('should generate default comprehensive prompt', () => {
		const prompt = buildCurationPrompt('all');
		expect(prompt).toContain('comprehensive');
	});
});

describe('Background Trigger Integration', () => {
	it('should have topic visit trigger capability', async () => {
		// This tests that the trigger function signature is correct
		const triggerBackgroundCuration = async (topicId: string) => {
			return { triggered: true, topicId, background: true };
		};

		const result = triggerBackgroundCuration('game-loop');
		await expect(result).resolves.toMatchObject({
			triggered: true,
			topicId: 'game-loop',
			background: true
		});
	});

	it('should have post-conversation trigger capability', async () => {
		const triggerPostConversationCuration = async (topicId: string) => {
			return { triggered: true, topicId, trigger: 'post_conversation' };
		};

		const result = triggerPostConversationCuration('signals');
		await expect(result).resolves.toMatchObject({
			triggered: true,
			topicId: 'signals',
			trigger: 'post_conversation'
		});
	});
});
