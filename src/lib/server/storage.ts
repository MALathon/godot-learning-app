import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { env } from '$env/dynamic/private';

const DATA_DIR = join(process.cwd(), 'data');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
const NOTEBOOKS_DIR = join(DATA_DIR, 'notebooks');
const PROGRESS_FILE = join(DATA_DIR, 'progress.json');
const EXTENSIONS_DIR = join(DATA_DIR, 'extensions');
const LESSONS_DIR = join(DATA_DIR, 'lessons');
const CONTENT_DIR = join(DATA_DIR, 'content');

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
	if (!existsSync(CONTENT_DIR)) {
		mkdirSync(CONTENT_DIR, { recursive: true });
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
	let settings = DEFAULT_SETTINGS;

	if (existsSync(SETTINGS_FILE)) {
		try {
			const data = readFileSync(SETTINGS_FILE, 'utf-8');
			settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
		} catch (error) {
			console.error(`Failed to read settings file: ${error instanceof Error ? error.message : error}`);
		}
	}

	// Fallback to environment variable if no API key in settings
	if (!settings.apiKey && env.ANTHROPIC_API_KEY) {
		settings.apiKey = env.ANTHROPIC_API_KEY;
	}

	return settings;
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

// =============================================================================
// Learning Journal (unified notes with ambient context)
// =============================================================================

const JOURNAL_FILE = join(DATA_DIR, 'journal.json');

export interface JournalEntry {
	id: string;
	content: string;
	timestamp: string;
	writtenFrom: string; // URL path where the note was written (loose context)
}

export interface Journal {
	entries: JournalEntry[];
}

export function getJournal(): Journal {
	ensureDataDirs();
	if (!existsSync(JOURNAL_FILE)) {
		return { entries: [] };
	}
	try {
		const data = readFileSync(JOURNAL_FILE, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read journal: ${error instanceof Error ? error.message : error}`);
		return { entries: [] };
	}
}

export function saveJournal(journal: Journal): void {
	ensureDataDirs();
	try {
		writeFileSync(JOURNAL_FILE, JSON.stringify(journal, null, 2));
	} catch (error) {
		console.error(`Failed to save journal: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
}

export function addJournalEntry(content: string, writtenFrom: string): JournalEntry {
	const journal = getJournal();
	const entry: JournalEntry = {
		id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
		content,
		timestamp: new Date().toISOString(),
		writtenFrom
	};
	journal.entries.unshift(entry); // Newest first
	saveJournal(journal);
	return entry;
}

export function updateJournalEntry(id: string, content: string): JournalEntry | null {
	const journal = getJournal();
	const entry = journal.entries.find(e => e.id === id);
	if (!entry) return null;
	entry.content = content;
	saveJournal(journal);
	return entry;
}

export function deleteJournalEntry(id: string): boolean {
	const journal = getJournal();
	const index = journal.entries.findIndex(e => e.id === id);
	if (index === -1) return false;
	journal.entries.splice(index, 1);
	saveJournal(journal);
	return true;
}

// =============================================================================
// Topic Content (AI-generated educational prose)
// =============================================================================

export interface ContentSection {
	title: string;
	content: string;               // Markdown prose
	level?: 'beginner' | 'intermediate' | 'advanced';
}

export interface TopicContent {
	introduction: string;          // Why this matters, context setting
	sections: ContentSection[];    // Main educational content
	summary?: string;              // Key takeaways
	nextSteps?: string;            // What to learn next
	generatedAt?: string;          // When AI generated this
	generatedBy?: 'ai' | 'human';  // Who wrote it
}

export function getTopicContent(topicId: string): TopicContent | null {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(topicId);
	const filePath = join(CONTENT_DIR, `${safeTopicId}.json`);
	if (!existsSync(filePath)) {
		return null;
	}
	try {
		const data = readFileSync(filePath, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read topic content for ${topicId}: ${error instanceof Error ? error.message : error}`);
		return null;
	}
}

export function saveTopicContent(topicId: string, content: TopicContent): void {
	ensureDataDirs();
	const safeTopicId = sanitizeTopicId(topicId);
	const filePath = join(CONTENT_DIR, `${safeTopicId}.json`);

	// Set generation metadata
	content.generatedAt = new Date().toISOString();
	content.generatedBy = content.generatedBy || 'ai';

	try {
		writeFileSync(filePath, JSON.stringify(content, null, 2));
	} catch (error) {
		console.error(`Failed to save topic content for ${safeTopicId}: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
}

export function getAllTopicContent(): Record<string, TopicContent> {
	ensureDataDirs();
	if (!existsSync(CONTENT_DIR)) {
		return {};
	}
	const files = readdirSync(CONTENT_DIR) as string[];
	const allContent: Record<string, TopicContent> = {};
	for (const f of files) {
		if (f.endsWith('.json')) {
			const topicId = f.replace('.json', '');
			const content = getTopicContent(topicId);
			if (content) {
				allContent[topicId] = content;
			}
		}
	}
	return allContent;
}

export function deleteTopicContent(topicId: string): boolean {
	const safeTopicId = sanitizeTopicId(topicId);
	const filePath = join(CONTENT_DIR, `${safeTopicId}.json`);
	if (existsSync(filePath)) {
		unlinkSync(filePath);
		return true;
	}
	return false;
}

// =============================================================================
// Content Gap Analysis
// =============================================================================

export interface ContentGaps {
	topicId: string;
	hasProseContent: boolean;
	proseContentAge?: number; // days since generation
	resourceCount: number;
	aiResourceCount: number;
	codeExampleCount: number;
	aiCodeExampleCount: number;
	lessonCount: number;
	gaps: {
		needsProseContent: boolean;
		needsResources: boolean;
		needsCodeExamples: boolean;
		needsLessons: boolean;
	};
	priority: 'high' | 'medium' | 'low';
	recommendations: string[];
}

const MIN_RESOURCES = 3;
const MIN_CODE_EXAMPLES = 2;
const PROSE_REFRESH_DAYS = 30;

export function analyzeContentGaps(topicId: string): ContentGaps {
	const safeTopicId = sanitizeTopicId(topicId);

	// Get all content sources
	const proseContent = getTopicContent(safeTopicId);
	const extension = getTopicExtension(safeTopicId);
	const lessons = getLessonsForTopic(safeTopicId);

	// Calculate counts
	const resourceCount = extension.resources.length;
	const aiResourceCount = extension.resources.filter(r => r.addedBy === 'ai').length;
	const codeExampleCount = extension.codeExamples.length;
	const aiCodeExampleCount = extension.codeExamples.filter(c => c.addedBy === 'ai').length;
	const lessonCount = lessons.length;

	// Check prose content age
	let proseContentAge: number | undefined;
	if (proseContent?.generatedAt) {
		const generatedDate = new Date(proseContent.generatedAt);
		const now = new Date();
		proseContentAge = Math.floor((now.getTime() - generatedDate.getTime()) / (1000 * 60 * 60 * 24));
	}

	// Identify gaps
	const needsProseContent = !proseContent || !proseContent.sections?.length ||
		(proseContentAge !== undefined && proseContentAge > PROSE_REFRESH_DAYS);
	const needsResources = resourceCount < MIN_RESOURCES;
	const needsCodeExamples = codeExampleCount < MIN_CODE_EXAMPLES;
	const needsLessons = lessonCount === 0;

	// Calculate priority
	const gapCount = [needsProseContent, needsResources, needsCodeExamples, needsLessons].filter(Boolean).length;
	let priority: 'high' | 'medium' | 'low';
	if (needsProseContent || gapCount >= 3) {
		priority = 'high';
	} else if (gapCount >= 2) {
		priority = 'medium';
	} else {
		priority = 'low';
	}

	// Generate recommendations
	const recommendations: string[] = [];
	if (needsProseContent) {
		if (!proseContent) {
			recommendations.push('Generate educational prose content for this topic');
		} else if (proseContentAge && proseContentAge > PROSE_REFRESH_DAYS) {
			recommendations.push(`Refresh prose content (${proseContentAge} days old)`);
		}
	}
	if (needsResources) {
		recommendations.push(`Add ${MIN_RESOURCES - resourceCount} more resources`);
	}
	if (needsCodeExamples) {
		recommendations.push(`Add ${MIN_CODE_EXAMPLES - codeExampleCount} more code examples`);
	}
	if (needsLessons) {
		recommendations.push('Generate at least one focused lesson');
	}

	return {
		topicId: safeTopicId,
		hasProseContent: !!proseContent?.sections?.length,
		proseContentAge,
		resourceCount,
		aiResourceCount,
		codeExampleCount,
		aiCodeExampleCount,
		lessonCount,
		gaps: {
			needsProseContent,
			needsResources,
			needsCodeExamples,
			needsLessons
		},
		priority,
		recommendations
	};
}

export function getAllContentGaps(): ContentGaps[] {
	// This would need access to all topic IDs - we'll import from the caller
	// For now, return empty - caller should pass topic IDs
	return [];
}

export function getTopicsNeedingContent(topicIds: string[]): ContentGaps[] {
	return topicIds
		.map(id => analyzeContentGaps(id))
		.filter(g => g.priority === 'high' || g.priority === 'medium')
		.sort((a, b) => {
			// Sort by priority, then by gap count
			const priorityOrder = { high: 0, medium: 1, low: 2 };
			if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
				return priorityOrder[a.priority] - priorityOrder[b.priority];
			}
			const aGaps = Object.values(a.gaps).filter(Boolean).length;
			const bGaps = Object.values(b.gaps).filter(Boolean).length;
			return bGaps - aGaps;
		});
}

// =============================================================================
// Content Notifications (track new additions for "What's New")
// =============================================================================

const NOTIFICATIONS_FILE = join(DATA_DIR, 'notifications.json');

export interface ContentNotification {
	id: string;
	type: 'prose' | 'resource' | 'code_example' | 'lesson';
	topicId: string;
	title: string;
	description?: string;
	timestamp: string;
	seen: boolean;
}

export interface NotificationsData {
	notifications: ContentNotification[];
	lastSeen: string | null;
}

const MAX_NOTIFICATIONS = 50;

export function getNotifications(): NotificationsData {
	ensureDataDirs();
	if (!existsSync(NOTIFICATIONS_FILE)) {
		return { notifications: [], lastSeen: null };
	}
	try {
		const data = readFileSync(NOTIFICATIONS_FILE, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read notifications: ${error instanceof Error ? error.message : error}`);
		return { notifications: [], lastSeen: null };
	}
}

export function saveNotifications(data: NotificationsData): void {
	ensureDataDirs();
	try {
		writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(data, null, 2));
	} catch (error) {
		console.error(`Failed to save notifications: ${error instanceof Error ? error.message : error}`);
	}
}

export function addNotification(notification: Omit<ContentNotification, 'id' | 'timestamp' | 'seen'>): ContentNotification {
	const data = getNotifications();

	const newNotification: ContentNotification = {
		...notification,
		id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
		timestamp: new Date().toISOString(),
		seen: false
	};

	data.notifications.unshift(newNotification);

	// Keep only recent notifications
	if (data.notifications.length > MAX_NOTIFICATIONS) {
		data.notifications = data.notifications.slice(0, MAX_NOTIFICATIONS);
	}

	saveNotifications(data);
	return newNotification;
}

export function markNotificationsSeen(): void {
	const data = getNotifications();
	data.lastSeen = new Date().toISOString();
	data.notifications = data.notifications.map(n => ({ ...n, seen: true }));
	saveNotifications(data);
}

export function getUnseenCount(): number {
	const data = getNotifications();
	return data.notifications.filter(n => !n.seen).length;
}

export function getRecentNotifications(limit: number = 20): ContentNotification[] {
	const data = getNotifications();
	return data.notifications.slice(0, limit);
}

// =============================================================================
// Learning Goal (global context for agents)
// =============================================================================

const GOAL_FILE = join(DATA_DIR, 'learning_goal.json');

export interface LearningGoal {
	goal: string;
	updatedAt: string;
}

const DEFAULT_GOAL: LearningGoal = {
	goal: 'Learn game programming through studying Godot under the hood',
	updatedAt: new Date().toISOString()
};

export function getLearningGoal(): LearningGoal {
	ensureDataDirs();
	if (!existsSync(GOAL_FILE)) {
		return DEFAULT_GOAL;
	}
	try {
		const data = readFileSync(GOAL_FILE, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.error(`Failed to read learning goal: ${error instanceof Error ? error.message : error}`);
		return DEFAULT_GOAL;
	}
}

export function saveLearningGoal(goal: string): LearningGoal {
	ensureDataDirs();
	const data: LearningGoal = {
		goal,
		updatedAt: new Date().toISOString()
	};
	try {
		writeFileSync(GOAL_FILE, JSON.stringify(data, null, 2));
	} catch (error) {
		console.error(`Failed to save learning goal: ${error instanceof Error ? error.message : error}`);
		throw error;
	}
	return data;
}

// Export sanitizeTopicId for use in API routes
export { sanitizeTopicId };
