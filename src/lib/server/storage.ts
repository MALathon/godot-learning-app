import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
const NOTEBOOKS_DIR = join(DATA_DIR, 'notebooks');
const PROGRESS_FILE = join(DATA_DIR, 'progress.json');
const EXTENSIONS_DIR = join(DATA_DIR, 'extensions');
const LESSONS_DIR = join(DATA_DIR, 'lessons');

/**
 * Sanitize topic ID to prevent path traversal attacks.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
function sanitizeTopicId(topicId: string): string {
	// Remove any path traversal attempts and invalid characters
	return topicId.replace(/[^a-zA-Z0-9_-]/g, '');
}

// Ensure data directories exist
function ensureDataDirs() {
	if (!existsSync(DATA_DIR)) {
		mkdirSync(DATA_DIR, { recursive: true });
	}
	if (!existsSync(NOTEBOOKS_DIR)) {
		mkdirSync(NOTEBOOKS_DIR, { recursive: true });
	}
	if (!existsSync(EXTENSIONS_DIR)) {
		mkdirSync(EXTENSIONS_DIR, { recursive: true });
	}
	if (!existsSync(LESSONS_DIR)) {
		mkdirSync(LESSONS_DIR, { recursive: true });
	}
}

// Settings
export interface Settings {
	apiKey: string | null;
	model: string;
}

const DEFAULT_SETTINGS: Settings = {
	apiKey: null,
	model: 'claude-sonnet-4-20250514'
};

export function getSettings(): Settings {
	ensureDataDirs();
	if (!existsSync(SETTINGS_FILE)) {
		return DEFAULT_SETTINGS;
	}
	try {
		const data = readFileSync(SETTINGS_FILE, 'utf-8');
		return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
	} catch (error) {
		console.error(`Failed to read settings file: ${error instanceof Error ? error.message : error}`);
		return DEFAULT_SETTINGS;
	}
}

export function saveSettings(settings: Partial<Settings>): Settings {
	ensureDataDirs();
	const current = getSettings();
	const updated = { ...current, ...settings };
	try {
		writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
	} catch (error) {
		console.error(`Failed to save settings: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
	return updated;
}

// Notebooks (chat history per topic)
export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
}

export interface Notebook {
	topicId: string;
	messages: ChatMessage[];
	createdAt: string;
	updatedAt: string;
}

export function getNotebook(topicId: string): Notebook {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(topicId);
	const filePath = join(NOTEBOOKS_DIR, `${safeTopicId}.json`);
	if (!existsSync(filePath)) {
		return {
			topicId,
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
	}
	try {
		const data = readFileSync(filePath, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read notebook for topic ${topicId}: ${error instanceof Error ? error.message : error}`);
		return {
			topicId,
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
	}
}

export function saveNotebook(notebook: Notebook): void {
	ensureDataDirs();
	notebook.updatedAt = new Date().toISOString();
	const safeTopicId = sanitizeTopicId(notebook.topicId);
	const filePath = join(NOTEBOOKS_DIR, `${safeTopicId}.json`);
	try {
		writeFileSync(filePath, JSON.stringify(notebook, null, 2));
	} catch (error) {
		console.error(`Failed to save notebook for topic ${safeTopicId}: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
}

export function addMessageToNotebook(topicId: string, message: ChatMessage): Notebook {
	const notebook = getNotebook(topicId);
	notebook.messages.push(message);
	saveNotebook(notebook);
	return notebook;
}

export function clearNotebook(topicId: string): Notebook {
	const notebook: Notebook = {
		topicId,
		messages: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
	saveNotebook(notebook);
	return notebook;
}

// Progress (moved from localStorage)
export interface TopicProgress {
	completed: boolean;
	exercisesCompleted: boolean[];
	lastVisited: string | null;
	notes: string;
}

export interface Progress {
	topics: Record<string, TopicProgress>;
}

export function getProgress(): Progress {
	ensureDataDirs();
	if (!existsSync(PROGRESS_FILE)) {
		return { topics: {} };
	}
	try {
		const data = readFileSync(PROGRESS_FILE, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read progress file: ${error instanceof Error ? error.message : error}`);
		return { topics: {} };
	}
}

export function saveProgress(progress: Progress): void {
	ensureDataDirs();
	try {
		writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
	} catch (error) {
		console.error(`Failed to save progress: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
}

export function updateTopicProgress(topicId: string, update: Partial<TopicProgress>): Progress {
	const progress = getProgress();
	const current = progress.topics[topicId] || {
		completed: false,
		exercisesCompleted: [],
		lastVisited: null,
		notes: ''
	};
	progress.topics[topicId] = { ...current, ...update };
	saveProgress(progress);
	return progress;
}

// List all notebooks
export function listNotebooks(): { topicId: string; messageCount: number; updatedAt: string }[] {
	ensureDataDirs();
	if (!existsSync(NOTEBOOKS_DIR)) {
		return [];
	}
	const files = readdirSync(NOTEBOOKS_DIR) as string[];
	return files
		.filter((f: string) => f.endsWith('.json'))
		.map((f: string) => {
			const notebook = getNotebook(f.replace('.json', ''));
			return {
				topicId: notebook.topicId,
				messageCount: notebook.messages.length,
				updatedAt: notebook.updatedAt
			};
		});
}

// Topic Extensions (dynamically added resources and code examples)
export interface TopicExtension {
	topicId: string;
	resources: Array<{
		title: string;
		url: string;
		type: 'docs' | 'source' | 'book' | 'video';
		addedAt: string;
		addedBy: 'ai' | 'user';
	}>;
	codeExamples: Array<{
		title: string;
		language: 'gdscript' | 'typescript' | 'python' | 'cpp';
		code: string;
		explanation: string;
		addedAt: string;
		addedBy: 'ai' | 'user';
	}>;
}

export function getTopicExtension(topicId: string): TopicExtension {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(topicId);
	const filePath = join(EXTENSIONS_DIR, `${safeTopicId}.json`);
	if (!existsSync(filePath)) {
		return {
			topicId,
			resources: [],
			codeExamples: []
		};
	}
	try {
		const data = readFileSync(filePath, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read topic extension for ${topicId}: ${error instanceof Error ? error.message : error}`);
		return {
			topicId,
			resources: [],
			codeExamples: []
		};
	}
}

export function saveTopicExtension(extension: TopicExtension): void {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(extension.topicId);
	const filePath = join(EXTENSIONS_DIR, `${safeTopicId}.json`);
	try {
		writeFileSync(filePath, JSON.stringify(extension, null, 2));
	} catch (error) {
		console.error(`Failed to save topic extension for ${safeTopicId}: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
}

export function addResourceToTopic(
	topicId: string,
	resource: { title: string; url: string; type: 'docs' | 'source' | 'book' | 'video' },
	addedBy: 'ai' | 'user' = 'ai'
): TopicExtension {
	const extension = getTopicExtension(topicId);
	extension.resources.push({
		...resource,
		addedAt: new Date().toISOString(),
		addedBy
	});
	saveTopicExtension(extension);
	return extension;
}

export function addCodeExampleToTopic(
	topicId: string,
	example: { title: string; language: 'gdscript' | 'typescript' | 'python' | 'cpp'; code: string; explanation: string },
	addedBy: 'ai' | 'user' = 'ai'
): TopicExtension {
	const extension = getTopicExtension(topicId);
	extension.codeExamples.push({
		...example,
		addedAt: new Date().toISOString(),
		addedBy
	});
	saveTopicExtension(extension);
	return extension;
}

export function getAllTopicExtensions(): Record<string, TopicExtension> {
	ensureDataDirs();
	if (!existsSync(EXTENSIONS_DIR)) {
		return {};
	}
	const files = readdirSync(EXTENSIONS_DIR) as string[];
	const extensions: Record<string, TopicExtension> = {};
	for (const f of files) {
		if (f.endsWith('.json')) {
			const topicId = f.replace('.json', '');
			extensions[topicId] = getTopicExtension(topicId);
		}
	}
	return extensions;
}

// =============================================================================
// Lessons (AI-generated pedagogical content)
// =============================================================================

export interface LessonContent {
	introduction: string;
	concepts: string[];
	explanation: string;
	exercises: string[];
	connections: string[];
}

export interface Lesson {
	id: string;
	topicId: string;
	title: string;
	difficulty: 'beginner' | 'intermediate' | 'advanced';
	content: LessonContent;
	generatedAt: string;
	generatedFor: string;
	addedBy: 'ai';
}

function ensureTopicLessonsDir(topicId: string): string {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(topicId);
	const topicDir = join(LESSONS_DIR, safeTopicId);
	if (!existsSync(topicDir)) {
		mkdirSync(topicDir, { recursive: true });
	}
	return topicDir;
}

function generateLessonId(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 50);
}

export function addLesson(
	topicId: string,
	lesson: Omit<Lesson, 'id' | 'generatedAt' | 'addedBy'>
): Lesson {
	const topicDir = ensureTopicLessonsDir(topicId);
	const id = generateLessonId(lesson.title);
	const fullLesson: Lesson = {
		...lesson,
		id,
		topicId,
		generatedAt: new Date().toISOString(),
		addedBy: 'ai'
	};

	const filePath = join(topicDir, `${id}.json`);
	try {
		writeFileSync(filePath, JSON.stringify(fullLesson, null, 2));
	} catch (error) {
		console.error(`Failed to save lesson ${id}: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
	return fullLesson;
}

export function getLesson(topicId: string, lessonId: string): Lesson | null {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(topicId);
	const safeLessonId = sanitizeTopicId(lessonId);
	const filePath = join(LESSONS_DIR, safeTopicId, `${safeLessonId}.json`);
	if (!existsSync(filePath)) {
		return null;
	}
	try {
		const data = readFileSync(filePath, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read lesson ${lessonId} for topic ${topicId}: ${error instanceof Error ? error.message : error}`);
		return null;
	}
}

export function getLessonsForTopic(topicId: string): Lesson[] {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(topicId);
	const topicDir = join(LESSONS_DIR, safeTopicId);
	if (!existsSync(topicDir)) {
		return [];
	}

	const files = readdirSync(topicDir) as string[];
	const lessons: Lesson[] = [];

	for (const f of files) {
		if (f.endsWith('.json')) {
			try {
				const data = readFileSync(join(topicDir, f), 'utf-8');
				lessons.push(JSON.parse(data));
			} catch (error) {
				console.error(`Failed to read lesson file ${f} for topic ${topicId}: ${error instanceof Error ? error.message : error}`);
				// Skip invalid files but log the issue
			}
		}
	}

	// Sort by generatedAt (newest first)
	return lessons.sort((a, b) =>
		new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
	);
}

export function getAllLessons(): Record<string, Lesson[]> {
	ensureDataDirs();
	if (!existsSync(LESSONS_DIR)) {
		return {};
	}

	const topicDirs = readdirSync(LESSONS_DIR) as string[];
	const allLessons: Record<string, Lesson[]> = {};

	for (const topicId of topicDirs) {
		const topicPath = join(LESSONS_DIR, topicId);
		// Skip files, only process directories
		try {
			const stat = statSync(topicPath);
			if (stat.isDirectory()) {
				const lessons = getLessonsForTopic(topicId);
				if (lessons.length > 0) {
					allLessons[topicId] = lessons;
				}
			}
		} catch (error) {
			console.error(`Failed to stat lesson directory ${topicId}: ${error instanceof Error ? error.message : error}`);
			// Skip on error
		}
	}

	return allLessons;
}

export function deleteLesson(topicId: string, lessonId: string): boolean {
	const safeTopicId = sanitizeTopicId(topicId);
	const safeLessonId = sanitizeTopicId(lessonId);
	const filePath = join(LESSONS_DIR, safeTopicId, `${safeLessonId}.json`);
	if (existsSync(filePath)) {
		unlinkSync(filePath);
		return true;
	}
	return false;
}

// =============================================================================
// Agent Activity Log (for UI transparency)
// =============================================================================

export interface AgentActivity {
	id: string;
	type: 'search' | 'add_resource' | 'add_code_example' | 'add_lesson' | 'thinking';
	details: string;
	topicId?: string;
	timestamp: string;
	agentName: 'gideon' | 'curator';
}

const ACTIVITY_LOG_FILE = join(DATA_DIR, 'agent_activity.json');
const MAX_ACTIVITY_ENTRIES = 100;

export function logAgentActivity(activity: Omit<AgentActivity, 'id' | 'timestamp'>): AgentActivity {
	ensureDataDirs();

	const fullActivity: AgentActivity = {
		...activity,
		id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
		timestamp: new Date().toISOString()
	};

	let activities: AgentActivity[] = [];
	if (existsSync(ACTIVITY_LOG_FILE)) {
		try {
			const data = readFileSync(ACTIVITY_LOG_FILE, 'utf-8');
			activities = JSON.parse(data);
		} catch (error) {
			console.error(`Failed to read activity log: ${error instanceof Error ? error.message : error}`);
			activities = [];
		}
	}

	activities.unshift(fullActivity);

	// Keep only the most recent entries
	if (activities.length > MAX_ACTIVITY_ENTRIES) {
		activities = activities.slice(0, MAX_ACTIVITY_ENTRIES);
	}

	try {
		writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(activities, null, 2));
	} catch (error) {
		console.error(`Failed to save agent activity log: ${error instanceof Error ? error.message : error}`);
		// Don't throw - activity logging is non-critical
	}
	return fullActivity;
}

export function getRecentAgentActivity(limit: number = 20): AgentActivity[] {
	ensureDataDirs();
	if (!existsSync(ACTIVITY_LOG_FILE)) {
		return [];
	}
	try {
		const data = readFileSync(ACTIVITY_LOG_FILE, 'utf-8');
		const activities: AgentActivity[] = JSON.parse(data);
		return activities.slice(0, limit);
	} catch (error) {
		console.error(`Failed to read recent agent activity: ${error instanceof Error ? error.message : error}`);
		return [];
	}
}

export function getAgentActivityForTopic(topicId: string, limit: number = 10): AgentActivity[] {
	const safeTopicId = sanitizeTopicId(topicId);
	const all = getRecentAgentActivity(MAX_ACTIVITY_ENTRIES);
	return all.filter(a => a.topicId === safeTopicId).slice(0, limit);
}

// Export sanitizeTopicId for use in API routes
export { sanitizeTopicId };
