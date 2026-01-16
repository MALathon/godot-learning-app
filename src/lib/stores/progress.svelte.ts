import { browser } from '$app/environment';

interface TopicProgress {
	completed: boolean;
	exercisesCompleted: boolean[];
	lastVisited: string | null;
	notes: string;
}

interface ProgressState {
	topics: Record<string, TopicProgress>;
	currentTopicId: string | null;
	loaded: boolean;
}

function createProgressStore() {
	const defaultState: ProgressState = {
		topics: {},
		currentTopicId: null,
		loaded: false
	};

	let state = $state<ProgressState>({ ...defaultState });

	// Load from server on init
	async function loadFromServer() {
		if (!browser) return;
		try {
			const response = await fetch('/api/progress');
			if (response.ok) {
				const data = await response.json();
				state.topics = data.topics || {};
				state.loaded = true;
			}
		} catch (e) {
			console.error('Failed to load progress from server:', e);
		}
	}

	// Save to server
	async function saveToServer(topicId: string, update: Partial<TopicProgress>) {
		if (!browser) return;
		try {
			await fetch('/api/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topicId, update })
			});
		} catch (e) {
			console.error('Failed to save progress:', e);
		}
	}

	// Initialize on first access
	if (browser) {
		loadFromServer();
	}

	function getTopicProgress(topicId: string): TopicProgress {
		return state.topics[topicId] ?? {
			completed: false,
			exercisesCompleted: [],
			lastVisited: null,
			notes: ''
		};
	}

	function markTopicVisited(topicId: string) {
		if (!state.topics[topicId]) {
			state.topics[topicId] = {
				completed: false,
				exercisesCompleted: [],
				lastVisited: null,
				notes: ''
			};
		}
		state.topics[topicId].lastVisited = new Date().toISOString();
		state.currentTopicId = topicId;
		saveToServer(topicId, { lastVisited: state.topics[topicId].lastVisited });
	}

	function markTopicCompleted(topicId: string, completed: boolean = true) {
		if (!state.topics[topicId]) {
			state.topics[topicId] = {
				completed: false,
				exercisesCompleted: [],
				lastVisited: null,
				notes: ''
			};
		}
		state.topics[topicId].completed = completed;
		saveToServer(topicId, { completed });
	}

	function toggleExercise(topicId: string, exerciseIndex: number, totalExercises: number) {
		if (!state.topics[topicId]) {
			state.topics[topicId] = {
				completed: false,
				exercisesCompleted: new Array(totalExercises).fill(false),
				lastVisited: null,
				notes: ''
			};
		}

		const progress = state.topics[topicId];
		if (!progress.exercisesCompleted.length) {
			progress.exercisesCompleted = new Array(totalExercises).fill(false);
		}

		progress.exercisesCompleted[exerciseIndex] = !progress.exercisesCompleted[exerciseIndex];
		saveToServer(topicId, { exercisesCompleted: progress.exercisesCompleted });
	}

	function updateNotes(topicId: string, notes: string) {
		if (!state.topics[topicId]) {
			state.topics[topicId] = {
				completed: false,
				exercisesCompleted: [],
				lastVisited: null,
				notes: ''
			};
		}
		state.topics[topicId].notes = notes;
		saveToServer(topicId, { notes });
	}

	function getCompletedCount(topicIds: string[]): number {
		return topicIds.filter(id => state.topics[id]?.completed).length;
	}

	async function resetProgress() {
		state.topics = {};
		state.currentTopicId = null;
		if (browser) {
			await fetch('/api/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topics: {} })
			});
		}
	}

	return {
		get state() { return state; },
		get currentTopicId() { return state.currentTopicId; },
		get loaded() { return state.loaded; },
		loadFromServer,
		getTopicProgress,
		markTopicVisited,
		markTopicCompleted,
		toggleExercise,
		updateNotes,
		getCompletedCount,
		resetProgress
	};
}

export const progressStore = createProgressStore();
