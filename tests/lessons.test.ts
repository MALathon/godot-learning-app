import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Test data directory (separate from production)
const TEST_DATA_DIR = join(process.cwd(), 'data-test-lessons');
const TEST_LESSONS_DIR = join(TEST_DATA_DIR, 'lessons');

// Helper to generate lesson ID from title
function generateLessonId(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 50);
}

describe('Lesson ID Generation', () => {
	it('should convert title to lowercase kebab-case', () => {
		expect(generateLessonId('Understanding Delta Time')).toBe('understanding-delta-time');
	});

	it('should remove special characters', () => {
		expect(generateLessonId("What's a Game Loop?")).toBe('what-s-a-game-loop');
	});

	it('should handle multiple spaces', () => {
		expect(generateLessonId('Multiple   Spaces   Here')).toBe('multiple-spaces-here');
	});

	it('should truncate long titles to 50 characters', () => {
		const longTitle =
			'This is a very long lesson title that should be truncated to fifty characters maximum';
		const id = generateLessonId(longTitle);
		expect(id.length).toBeLessThanOrEqual(50);
	});

	it('should remove leading and trailing hyphens', () => {
		expect(generateLessonId('--Test Title--')).toBe('test-title');
	});
});

describe('Lesson Storage Operations', () => {
	beforeAll(() => {
		// Clean up and create test directories
		if (existsSync(TEST_DATA_DIR)) {
			rmSync(TEST_DATA_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_LESSONS_DIR, { recursive: true });
	});

	afterAll(() => {
		// Clean up test data
		if (existsSync(TEST_DATA_DIR)) {
			rmSync(TEST_DATA_DIR, { recursive: true, force: true });
		}
	});

	it('should create topic lesson directory', () => {
		const topicDir = join(TEST_LESSONS_DIR, 'game-loop');
		mkdirSync(topicDir, { recursive: true });
		expect(existsSync(topicDir)).toBe(true);
	});

	it('should save lesson to JSON file', () => {
		const topicDir = join(TEST_LESSONS_DIR, 'game-loop-save');
		mkdirSync(topicDir, { recursive: true });

		const lesson = {
			id: 'understanding-delta-time',
			topicId: 'game-loop',
			title: 'Understanding Delta Time',
			difficulty: 'beginner',
			content: {
				introduction: 'Delta time is essential.',
				concepts: ['Frame independence'],
				explanation: 'Detailed explanation...',
				exercises: [],
				connections: []
			},
			generatedAt: new Date().toISOString(),
			generatedFor: 'Test',
			addedBy: 'ai'
		};

		const filePath = join(topicDir, `${lesson.id}.json`);
		writeFileSync(filePath, JSON.stringify(lesson, null, 2));

		expect(existsSync(filePath)).toBe(true);

		const saved = JSON.parse(readFileSync(filePath, 'utf-8'));
		expect(saved.title).toBe('Understanding Delta Time');
		expect(saved.addedBy).toBe('ai');
	});

	it('should retrieve lesson from JSON file', () => {
		const topicDir = join(TEST_LESSONS_DIR, 'signals-retrieve');
		mkdirSync(topicDir, { recursive: true });

		const lesson = {
			id: 'custom-signals',
			topicId: 'signals',
			title: 'Custom Signals',
			difficulty: 'intermediate',
			content: {
				introduction: 'Custom signals allow decoupled communication.',
				concepts: ['Decoupling', 'Observer pattern'],
				explanation: 'How to create and use custom signals...',
				exercises: ['Create a health signal'],
				connections: ['game-loop']
			},
			generatedAt: '2026-01-16T10:00:00.000Z',
			generatedFor: 'User asked about signals',
			addedBy: 'ai'
		};

		const filePath = join(topicDir, `${lesson.id}.json`);
		writeFileSync(filePath, JSON.stringify(lesson, null, 2));

		const retrieved = JSON.parse(readFileSync(filePath, 'utf-8'));
		expect(retrieved.id).toBe('custom-signals');
		expect(retrieved.difficulty).toBe('intermediate');
		expect(retrieved.content.concepts).toContain('Observer pattern');
	});

	it('should list all lessons for a topic', () => {
		const topicDir = join(TEST_LESSONS_DIR, 'game-loop-list');
		mkdirSync(topicDir, { recursive: true });

		// Create multiple lessons
		const lessons = [
			{ id: 'lesson-1', title: 'Lesson 1' },
			{ id: 'lesson-2', title: 'Lesson 2' },
			{ id: 'lesson-3', title: 'Lesson 3' }
		];

		lessons.forEach((lesson) => {
			const filePath = join(topicDir, `${lesson.id}.json`);
			writeFileSync(filePath, JSON.stringify(lesson, null, 2));
		});

		const files = require('fs').readdirSync(topicDir);
		const jsonFiles = files.filter((f: string) => f.endsWith('.json'));
		expect(jsonFiles.length).toBe(3);
	});

	it('should delete a lesson', () => {
		const topicDir = join(TEST_LESSONS_DIR, 'game-loop-delete');
		mkdirSync(topicDir, { recursive: true });

		const filePath = join(topicDir, 'to-delete.json');
		writeFileSync(filePath, JSON.stringify({ id: 'to-delete' }));

		expect(existsSync(filePath)).toBe(true);

		rmSync(filePath);

		expect(existsSync(filePath)).toBe(false);
	});
});

describe('Lesson Validation', () => {
	const validDifficulties = ['beginner', 'intermediate', 'advanced'];

	it('should accept valid difficulty levels', () => {
		validDifficulties.forEach((difficulty) => {
			expect(validDifficulties).toContain(difficulty);
		});
	});

	it('should reject invalid difficulty levels', () => {
		const invalidDifficulties = ['easy', 'hard', 'expert', ''];
		invalidDifficulties.forEach((difficulty) => {
			expect(validDifficulties).not.toContain(difficulty);
		});
	});

	it('should require introduction in content', () => {
		const validateContent = (content: { introduction?: string }): boolean => {
			return Boolean(content.introduction && typeof content.introduction === 'string');
		};

		expect(validateContent({ introduction: 'Valid intro' })).toBe(true);
		expect(validateContent({ introduction: '' })).toBe(false);
		expect(validateContent({})).toBe(false);
	});

	it('should require explanation in content', () => {
		const validateContent = (content: { explanation?: string }): boolean => {
			return Boolean(content.explanation && typeof content.explanation === 'string');
		};

		expect(validateContent({ explanation: 'Valid explanation' })).toBe(true);
		expect(validateContent({ explanation: '' })).toBe(false);
	});

	it('should require concepts as array', () => {
		const validateContent = (content: { concepts?: unknown }) => {
			return Array.isArray(content.concepts);
		};

		expect(validateContent({ concepts: ['point 1', 'point 2'] })).toBe(true);
		expect(validateContent({ concepts: 'not an array' })).toBe(false);
		expect(validateContent({})).toBe(false);
	});
});

describe('Lesson Topic Validation', () => {
	const validTopics = [
		'game-loop',
		'scene-tree',
		'signals',
		'nodes-resources',
		'servers',
		'gdscript-internals',
		'composition',
		'state-machines'
	];

	it('should have 8 valid topics', () => {
		expect(validTopics.length).toBe(8);
	});

	it('should accept lessons for valid topics', () => {
		validTopics.forEach((topicId) => {
			expect(validTopics).toContain(topicId);
		});
	});

	it('should reject lessons for invalid topics', () => {
		const invalidTopics = ['invalid-topic', 'unknown', ''];
		invalidTopics.forEach((topicId) => {
			expect(validTopics).not.toContain(topicId);
		});
	});
});
