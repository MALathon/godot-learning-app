import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
const NOTEBOOKS_DIR = join(DATA_DIR, 'notebooks');
const PROGRESS_FILE = join(DATA_DIR, 'progress.json');
const EXTENSIONS_DIR = join(DATA_DIR, 'extensions');

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
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export function saveSettings(settings: Partial<Settings>): Settings {
	ensureDataDirs();
	const current = getSettings();
	const updated = { ...current, ...settings };
	writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
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
	const filePath = join(NOTEBOOKS_DIR, `${topicId}.json`);
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
	} catch {
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
	const filePath = join(NOTEBOOKS_DIR, `${notebook.topicId}.json`);
	writeFileSync(filePath, JSON.stringify(notebook, null, 2));
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
	} catch {
		return { topics: {} };
	}
}

export function saveProgress(progress: Progress): void {
	ensureDataDirs();
	writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
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
	const filePath = join(EXTENSIONS_DIR, `${topicId}.json`);
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
	} catch {
		return {
			topicId,
			resources: [],
			codeExamples: []
		};
	}
}

export function saveTopicExtension(extension: TopicExtension): void {
	ensureDataDirs();
	const filePath = join(EXTENSIONS_DIR, `${extension.topicId}.json`);
	writeFileSync(filePath, JSON.stringify(extension, null, 2));
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
