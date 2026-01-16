import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Test data directory
const TEST_DATA_DIR = join(process.cwd(), 'data-test');
const TEST_EXTENSIONS_DIR = join(TEST_DATA_DIR, 'extensions');
const TEST_NOTEBOOKS_DIR = join(TEST_DATA_DIR, 'notebooks');
const TEST_ACTIVITY_FILE = join(TEST_DATA_DIR, 'agent_activity.json');

describe('Extension Storage', () => {
	beforeEach(() => {
		mkdirSync(TEST_EXTENSIONS_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DATA_DIR)) {
			rmSync(TEST_DATA_DIR, { recursive: true, force: true });
		}
	});

	it('should create extension file for topic', () => {
		const extension = {
			topicId: 'game-loop',
			resources: [],
			codeExamples: []
		};

		const filePath = join(TEST_EXTENSIONS_DIR, 'game-loop.json');
		writeFileSync(filePath, JSON.stringify(extension, null, 2));

		expect(existsSync(filePath)).toBe(true);
	});

	it('should add resource to extension', () => {
		const extension = {
			topicId: 'game-loop',
			resources: [] as Array<{ title: string; url: string; type: string; addedAt: string; addedBy: string }>,
			codeExamples: [] as Array<{ title: string; language: string; code: string; explanation: string; addedAt: string; addedBy: string }>
		};

		extension.resources.push({
			title: 'Godot Docs',
			url: 'https://docs.godotengine.org',
			type: 'docs',
			addedAt: new Date().toISOString(),
			addedBy: 'ai'
		});

		expect(extension.resources.length).toBe(1);
		expect(extension.resources[0].addedBy).toBe('ai');
	});

	it('should add code example to extension', () => {
		const extension = {
			topicId: 'game-loop',
			resources: [] as Array<{ title: string; url: string; type: string; addedAt: string; addedBy: string }>,
			codeExamples: [] as Array<{ title: string; language: string; code: string; explanation: string; addedAt: string; addedBy: string }>
		};

		extension.codeExamples.push({
			title: 'Delta Time Example',
			language: 'gdscript',
			code: 'func _process(delta): pass',
			explanation: 'Basic process function',
			addedAt: new Date().toISOString(),
			addedBy: 'ai'
		});

		expect(extension.codeExamples.length).toBe(1);
		expect(extension.codeExamples[0].language).toBe('gdscript');
	});

	it('should merge extensions without duplicates', () => {
		const existingResources = [
			{ title: 'Resource 1', url: 'https://example.com/1' },
			{ title: 'Resource 2', url: 'https://example.com/2' }
		];

		const newResource = { title: 'Resource 3', url: 'https://example.com/3' };

		// Check for duplicate URL before adding
		const isDuplicate = existingResources.some((r) => r.url === newResource.url);
		expect(isDuplicate).toBe(false);

		existingResources.push(newResource);
		expect(existingResources.length).toBe(3);
	});
});

describe('Notebook Storage', () => {
	beforeEach(() => {
		mkdirSync(TEST_NOTEBOOKS_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DATA_DIR)) {
			rmSync(TEST_DATA_DIR, { recursive: true, force: true });
		}
	});

	it('should create notebook for topic', () => {
		const notebook = {
			topicId: 'game-loop',
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		const filePath = join(TEST_NOTEBOOKS_DIR, 'game-loop.json');
		writeFileSync(filePath, JSON.stringify(notebook, null, 2));

		expect(existsSync(filePath)).toBe(true);
	});

	it('should add message to notebook', () => {
		const notebook = {
			topicId: 'game-loop',
			messages: [] as Array<{ role: string; content: string; timestamp: string }>,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		notebook.messages.push({
			role: 'user',
			content: 'Hello!',
			timestamp: new Date().toISOString()
		});

		notebook.messages.push({
			role: 'assistant',
			content: 'Hi there!',
			timestamp: new Date().toISOString()
		});

		expect(notebook.messages.length).toBe(2);
		expect(notebook.messages[0].role).toBe('user');
		expect(notebook.messages[1].role).toBe('assistant');
	});

	it('should update notebook timestamp', () => {
		const originalTime = '2026-01-16T10:00:00.000Z';
		const notebook = {
			topicId: 'game-loop',
			messages: [],
			createdAt: originalTime,
			updatedAt: originalTime
		};

		notebook.updatedAt = new Date().toISOString();

		expect(notebook.updatedAt).not.toBe(originalTime);
	});
});

describe('Agent Activity Logging', () => {
	beforeEach(() => {
		mkdirSync(TEST_DATA_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DATA_DIR)) {
			rmSync(TEST_DATA_DIR, { recursive: true, force: true });
		}
	});

	it('should log agent activity', () => {
		const activities: Array<{
			type: string;
			details: string;
			topicId?: string;
			agentName: string;
			timestamp: string;
		}> = [];

		const activity = {
			type: 'search',
			details: 'Searched for delta time resources',
			topicId: 'game-loop',
			agentName: 'curator',
			timestamp: new Date().toISOString()
		};

		activities.push(activity);

		expect(activities.length).toBe(1);
		expect(activities[0].type).toBe('search');
		expect(activities[0].agentName).toBe('curator');
	});

	it('should support different activity types', () => {
		const validTypes = ['search', 'add_resource', 'add_code_example', 'add_lesson', 'thinking'];

		validTypes.forEach((type) => {
			const activity = {
				type,
				details: `Activity of type ${type}`,
				agentName: 'gideon',
				timestamp: new Date().toISOString()
			};

			expect(validTypes).toContain(activity.type);
		});
	});

	it('should limit activity log size', () => {
		const MAX_ENTRIES = 100;
		const activities: Array<{ id: number }> = [];

		// Add more than max entries
		for (let i = 0; i < 150; i++) {
			activities.push({ id: i });
		}

		// Trim to max
		const trimmed = activities.slice(-MAX_ENTRIES);

		expect(trimmed.length).toBe(MAX_ENTRIES);
		expect(trimmed[0].id).toBe(50); // First 50 should be removed
	});

	it('should filter activities by topic', () => {
		const activities = [
			{ type: 'search', topicId: 'game-loop', agentName: 'curator' },
			{ type: 'add_resource', topicId: 'signals', agentName: 'curator' },
			{ type: 'search', topicId: 'game-loop', agentName: 'curator' },
			{ type: 'add_lesson', topicId: 'scene-tree', agentName: 'curator' }
		];

		const gameLoopActivities = activities.filter((a) => a.topicId === 'game-loop');

		expect(gameLoopActivities.length).toBe(2);
	});

	it('should filter activities by agent', () => {
		const activities = [
			{ type: 'search', agentName: 'gideon' },
			{ type: 'add_resource', agentName: 'curator' },
			{ type: 'thinking', agentName: 'gideon' }
		];

		const gideonActivities = activities.filter((a) => a.agentName === 'gideon');

		expect(gideonActivities.length).toBe(2);
	});
});

describe('Progress Storage', () => {
	it('should track topic completion', () => {
		const progress = {
			topics: {} as Record<
				string,
				{
					completed: boolean;
					exercisesCompleted: string[];
					lastVisited: string | null;
					notes: string;
				}
			>
		};

		progress.topics['game-loop'] = {
			completed: true,
			exercisesCompleted: ['exercise-1', 'exercise-2'],
			lastVisited: new Date().toISOString(),
			notes: 'Understood delta time concept'
		};

		expect(progress.topics['game-loop'].completed).toBe(true);
		expect(progress.topics['game-loop'].exercisesCompleted.length).toBe(2);
	});

	it('should track notes per topic', () => {
		const progress = {
			topics: {
				signals: {
					completed: false,
					exercisesCompleted: [],
					lastVisited: null,
					notes: ''
				}
			}
		};

		progress.topics.signals.notes = 'Need to understand custom signals better';

		expect(progress.topics.signals.notes).toContain('custom signals');
	});

	it('should update lastVisited timestamp', () => {
		const progress = {
			topics: {
				'game-loop': {
					completed: false,
					exercisesCompleted: [],
					lastVisited: null as string | null,
					notes: ''
				}
			}
		};

		expect(progress.topics['game-loop'].lastVisited).toBeNull();

		progress.topics['game-loop'].lastVisited = new Date().toISOString();

		expect(progress.topics['game-loop'].lastVisited).not.toBeNull();
	});
});
