<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import type { Topic } from '$lib/data/topics';
	import type { TopicProgress, TopicExtension, Lesson, AgentActivity, ContentNotification } from '$lib/server/storage';

	interface Props {
		topic?: Topic;
		progress?: TopicProgress;
		notes?: string;
		currentPath?: string;
	}

	let { topic, progress, notes = '', currentPath = '/' }: Props = $props();

	// Panel state
	let isOpen = $state(false);
	let isAnimating = $state(false);
	let activeView = $state<'curated' | 'chat'>('curated');

	// Curated content state
	let extension = $state<TopicExtension | null>(null);
	let lessons = $state<Lesson[]>([]);
	let recentActivity = $state<AgentActivity[]>([]);
	let curatedLoading = $state(false);
	let expandedCode = $state<number | null>(null);
	let expandedLesson = $state<string | null>(null);
	let curating = $state(false);
	let curateMessage = $state<string | null>(null);

	// Notifications state
	let notifications = $state<ContentNotification[]>([]);
	let unseenCount = $state(0);
	let notificationsLoading = $state(false);

	// Learning goal state
	let learningGoal = $state('');
	let editingGoal = $state(false);
	let goalInput = $state('');
	let savingGoal = $state(false);

	// Context-aware state
	const hasTopicContext = $derived(!!topic);
	const contextTitle = $derived(topic?.title ?? 'General');
	const contextId = $derived(topic?.id ?? 'general');

	// AI-curated counts
	const aiResourceCount = $derived(extension?.resources.filter(r => r.addedBy === 'ai').length ?? 0);
	const aiCodeCount = $derived(extension?.codeExamples.filter(c => c.addedBy === 'ai').length ?? 0);
	const totalCurated = $derived(aiResourceCount + aiCodeCount + lessons.length);

	// Message types
	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
		timestamp: string;
	}

	interface ActivityMessage {
		type: 'activity';
		action: 'search' | 'add_resource' | 'add_code_example' | 'add_lesson' | 'thinking';
		details: string;
		timestamp: string;
	}

	type Message = ChatMessage | ActivityMessage;

	// Chat state
	let messages = $state<Message[]>([]);
	let input = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lettaAvailable = $state(true);
	let messagesContainer: HTMLElement | null = $state(null);
	let abortController: AbortController | null = null;

	// Enhanced state
	let showThinking = $state(true);
	let currentThinking = $state<string | null>(null);

	// Copy state
	let copiedIdx = $state<number | null>(null);

	function togglePanel() {
		if (isAnimating) return;
		isAnimating = true;
		isOpen = !isOpen;
		setTimeout(() => { isAnimating = false; }, 300);
	}

	async function loadNotifications() {
		notificationsLoading = true;
		try {
			const response = await fetch('/api/notifications?limit=20');
			if (response.ok) {
				const data = await response.json();
				notifications = data.notifications || [];
				unseenCount = data.unseenCount || 0;
			}
		} catch (e) {
			console.error('Failed to load notifications:', e);
		} finally {
			notificationsLoading = false;
		}
	}

	async function markNotificationsSeen() {
		if (unseenCount === 0) return;
		try {
			await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'markSeen' })
			});
			unseenCount = 0;
			notifications = notifications.map(n => ({ ...n, seen: true }));
		} catch (e) {
			console.error('Failed to mark notifications seen:', e);
		}
	}

	async function clearNotifications() {
		try {
			await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clear' })
			});
			notifications = [];
			unseenCount = 0;
		} catch (e) {
			console.error('Failed to clear notifications:', e);
		}
	}

	async function loadLearningGoal() {
		try {
			const response = await fetch('/api/goal');
			if (response.ok) {
				const data = await response.json();
				learningGoal = data.goal || '';
			}
		} catch (e) {
			console.error('Failed to load learning goal:', e);
		}
	}

	function startEditingGoal() {
		goalInput = learningGoal;
		editingGoal = true;
	}

	function cancelEditingGoal() {
		editingGoal = false;
		goalInput = '';
	}

	async function saveGoal() {
		if (savingGoal) return;
		savingGoal = true;
		try {
			const response = await fetch('/api/goal', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ goal: goalInput })
			});
			if (response.ok) {
				const data = await response.json();
				learningGoal = data.goal;
				editingGoal = false;
				goalInput = '';
			}
		} catch (e) {
			console.error('Failed to save learning goal:', e);
		} finally {
			savingGoal = false;
		}
	}

	async function loadCuratedContent() {
		if (!hasTopicContext) return;

		curatedLoading = true;
		try {
			const [extRes, lessonsRes, activityRes] = await Promise.all([
				fetch(`/api/extensions/${contextId}`),
				fetch(`/api/letta/lessons?topicId=${contextId}`),
				fetch(`/api/letta/activity?topicId=${contextId}&limit=5`)
			]);

			if (extRes.ok) {
				extension = await extRes.json();
			}
			if (lessonsRes.ok) {
				const data = await lessonsRes.json();
				lessons = data.lessons || [];
			}
			if (activityRes.ok) {
				const data = await activityRes.json();
				recentActivity = data.activities || [];
			}
		} catch (e) {
			console.error('Failed to load curated content:', e);
		} finally {
			curatedLoading = false;
		}
	}

	async function triggerCuration() {
		if (!hasTopicContext || curating) return;

		curating = true;
		curateMessage = 'Gideon is reading memory and finding content...';

		// Create abort controller with 30 second timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000);

		try {
			const response = await fetch('/api/letta/curate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'generate',
					topicId: contextId
				}),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json();
				const toolCount = data.toolsUsed?.length || 0;
				curateMessage = toolCount > 0
					? `Added ${toolCount} items! Refreshing...`
					: 'Analysis complete. Refreshing...';

				// Reload content after a short delay
				setTimeout(async () => {
					await loadCuratedContent();
					curateMessage = null;
				}, 1500);
			} else {
				const err = await response.json();
				curateMessage = err.error || 'Curation failed';
				setTimeout(() => { curateMessage = null; }, 3000);
			}
		} catch (e) {
			clearTimeout(timeoutId);
			console.error('Curation error:', e);
			if (e instanceof Error && e.name === 'AbortError') {
				curateMessage = 'Request timed out - Letta server may be slow';
			} else {
				curateMessage = 'Failed to connect to agent';
			}
			setTimeout(() => { curateMessage = null; }, 3000);
		} finally {
			curating = false;
		}
	}

	// Generate prose content for the topic
	let generating = $state(false);
	let generateMessage = $state<string | null>(null);

	async function generateProseContent() {
		if (!hasTopicContext || generating) return;

		generating = true;
		generateMessage = 'Writing educational content for this topic...';

		// Longer timeout for content generation (60 seconds)
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 60000);

		try {
			const response = await fetch('/api/content/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topicId: contextId,
					regenerate: false
				}),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json();
				if (data.cached) {
					generateMessage = 'Content already exists. Reload page to see it.';
				} else {
					generateMessage = `Generated ${data.sectionsCount} sections! Reload page to read.`;
				}
				setTimeout(() => { generateMessage = null; }, 4000);
			} else {
				const err = await response.json();
				generateMessage = err.error || 'Generation failed';
				setTimeout(() => { generateMessage = null; }, 4000);
			}
		} catch (e) {
			clearTimeout(timeoutId);
			console.error('Content generation error:', e);
			if (e instanceof Error && e.name === 'AbortError') {
				generateMessage = 'Request timed out - content generation may take longer';
			} else {
				generateMessage = 'Failed to generate content';
			}
			setTimeout(() => { generateMessage = null; }, 4000);
		} finally {
			generating = false;
		}
	}

	async function copyMessage(content: string, idx: number) {
		try {
			await navigator.clipboard.writeText(content);
			copiedIdx = idx;
			setTimeout(() => { copiedIdx = null; }, 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}

	async function copyCode(code: string) {
		try {
			await navigator.clipboard.writeText(code);
		} catch (e) {
			console.error('Failed to copy code:', e);
		}
	}

	onMount(async () => {
		// Always load notifications and goal
		loadNotifications();
		loadLearningGoal();

		if (hasTopicContext) {
			await Promise.all([loadNotebook(), loadCuratedContent()]);
		}
	});

	$effect(() => {
		if (hasTopicContext && contextId) {
			loadNotebook().catch(e => console.error('Failed to load notebook:', e));
			loadCuratedContent().catch(e => console.error('Failed to load curated:', e));
		}
	});

	// Mark notifications as seen when viewing the Learning tab
	$effect(() => {
		if (isOpen && activeView === 'curated' && unseenCount > 0) {
			// Small delay to let the user see the unseen state briefly
			const timer = setTimeout(() => {
				markNotificationsSeen();
			}, 1500);
			return () => clearTimeout(timer);
		}
	});

	async function loadNotebook() {
		try {
			const response = await fetch(`/api/notebook/${contextId}`);
			if (response.ok) {
				const notebook = await response.json();
				messages = notebook.messages || [];
				await scrollToBottom();
			}
		} catch (e) {
			console.error('Failed to load notebook:', e);
		}
	}

	function stopGeneration() {
		if (abortController) {
			abortController.abort();
			abortController = null;
			loading = false;
			currentThinking = null;
		}
	}

	async function sendMessage() {
		if (!input.trim() || loading) return;

		const userMessage = input.trim();
		input = '';
		loading = true;
		error = null;
		currentThinking = null;
		activeView = 'chat'; // Switch to chat view when sending

		abortController = new AbortController();

		messages = [...messages, {
			role: 'user',
			content: userMessage,
			timestamp: new Date().toISOString()
		}];
		await scrollToBottom();

		messages = [...messages, {
			role: 'assistant',
			content: '',
			timestamp: new Date().toISOString()
		}];

		try {
			const requestBody: Record<string, unknown> = {
				topicId: contextId,
				message: userMessage,
				stream: true,
				learningGoal: learningGoal || undefined
			};

			if (hasTopicContext && topic) {
				requestBody.topicContext = {
					title: topic.title,
					category: topic.category,
					description: topic.description,
					keyPoints: topic.keyPoints,
					godotConnection: topic.godotConnection,
					exercises: topic.exercises,
					notes: notes || ''
				};
			}

			const response = await fetch('/api/chat-letta', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: abortController.signal,
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to get response');
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				let eventType = '';
				for (const line of lines) {
					if (line.startsWith('event: ')) {
						eventType = line.slice(7);
					} else if (line.startsWith('data: ')) {
						const data = JSON.parse(line.slice(6));

						switch (eventType) {
							case 'text':
								messages = messages.map((m, i) =>
									i === messages.length - 1 && 'content' in m
										? { ...m, content: m.content + data.text }
										: m
								);
								await scrollToBottom();
								break;

							case 'thinking':
								if (showThinking && data.reasoning) {
									currentThinking = data.reasoning;
								}
								break;

							case 'tool':
								if (data.name && data.name !== 'send_message') {
									const activityMsg: ActivityMessage = {
										type: 'activity',
										action: mapToolToAction(data.name),
										details: formatToolDetails(data.name, data.title || data.result),
										timestamp: new Date().toISOString()
									};
									const lastIdx = messages.length - 1;
									messages = [
										...messages.slice(0, lastIdx),
										activityMsg,
										messages[lastIdx]
									];

									// Refresh curated content if agent added something
									if (['add_resource', 'add_code_example', 'add_lesson'].includes(data.name)) {
										loadCuratedContent();
									}
								}
								break;

							case 'done':
								messages = data.notebook.messages;
								currentThinking = null;
								break;

							case 'error':
								throw new Error(data.error);
						}
					}
				}
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') {
				const lastMessage = messages[messages.length - 1];
				if ('role' in lastMessage && lastMessage.role === 'assistant' && !lastMessage.content) {
					messages = messages.slice(0, -1);
				}
			} else {
				const errorMessage = e instanceof Error ? e.message : 'Something went wrong';
				error = errorMessage;
				messages = messages.slice(0, -2);

				if (errorMessage.includes('Letta') || errorMessage.includes('fetch')) {
					lettaAvailable = false;
				}
			}
		} finally {
			loading = false;
			abortController = null;
			currentThinking = null;
			await scrollToBottom();
		}
	}

	function mapToolToAction(toolName: string): ActivityMessage['action'] {
		if (toolName.includes('search') || toolName === 'web_search') return 'search';
		if (toolName === 'add_resource') return 'add_resource';
		if (toolName === 'add_code_example') return 'add_code_example';
		if (toolName === 'add_lesson') return 'add_lesson';
		return 'thinking';
	}

	function formatToolDetails(toolName: string, result?: string): string {
		switch (toolName) {
			case 'web_search': return 'Searching for resources...';
			case 'add_resource': return result ? `Added: ${result}` : 'Adding resource...';
			case 'add_code_example': return result ? `Added: ${result}` : 'Adding code...';
			case 'add_lesson': return result ? `Generated: ${result}` : 'Generating lesson...';
			default: return result || `Using ${toolName}...`;
		}
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function formatMessage(content: string): string {
		const escaped = escapeHtml(content);
		return escaped
			.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\n/g, '<br>');
	}

	function formatTimeAgo(timestamp: string): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	const resourceIcons: Record<string, string> = {
		docs: 'D',
		source: 'S',
		book: 'B',
		video: 'V'
	};

	const activityIcons: Record<string, string> = {
		search: 'S',
		add_resource: 'R',
		add_code_example: 'C',
		add_lesson: 'L',
		thinking: 'T'
	};
</script>

<div class="floating-chat" class:open={isOpen}>
	<!-- FAB Button -->
	<button
		class="fab"
		class:hidden={isOpen}
		class:has-unseen={unseenCount > 0}
		onclick={togglePanel}
		aria-label="Open learning hub"
	>
		<span class="fab-icon">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
			</svg>
		</span>
		{#if unseenCount > 0}
			<span class="fab-badge unseen">{unseenCount}</span>
		{:else if totalCurated > 0}
			<span class="fab-badge">{totalCurated}</span>
		{/if}
	</button>

	<!-- Learning Panel -->
	<div class="learning-panel" class:visible={isOpen}>
		<header class="panel-header">
			<div class="header-left">
				<div class="agent-avatar">G</div>
				<div class="header-info">
					<span class="agent-name">Gideon</span>
					<span class="context-tag">{contextTitle}</span>
				</div>
			</div>
			<div class="header-actions">
				{#if totalCurated > 0}
					<span class="curated-badge" title="AI-curated items">
						{totalCurated} curated
					</span>
				{/if}
				<button class="header-btn close-btn" onclick={togglePanel} title="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 9l6 6 6-6"/>
					</svg>
				</button>
			</div>
		</header>

		<!-- Learning Goal -->
		<div class="goal-bar">
			{#if editingGoal}
				<div class="goal-edit">
					<input
						type="text"
						class="goal-input"
						bind:value={goalInput}
						placeholder="What's your learning goal?"
						maxlength="500"
						onkeydown={(e) => e.key === 'Enter' && saveGoal()}
					/>
					<div class="goal-actions">
						<button class="goal-btn save" onclick={saveGoal} disabled={savingGoal}>
							{savingGoal ? '...' : 'Save'}
						</button>
						<button class="goal-btn cancel" onclick={cancelEditingGoal}>
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<button class="goal-display" onclick={startEditingGoal} title="Click to edit your learning goal">
					<span class="goal-icon">🎯</span>
					<span class="goal-text">{learningGoal || 'Set your learning goal...'}</span>
					<span class="goal-edit-hint">Edit</span>
				</button>
			{/if}
		</div>

		<!-- View Toggle -->
		<div class="view-toggle">
			<button
				class="toggle-btn"
				class:active={activeView === 'curated'}
				onclick={() => activeView = 'curated'}
			>
				<span class="toggle-icon">L</span>
				Learning
				{#if unseenCount > 0}
					<span class="toggle-count unseen">{unseenCount}</span>
				{:else if totalCurated > 0}
					<span class="toggle-count">{totalCurated}</span>
				{/if}
			</button>
			<button
				class="toggle-btn"
				class:active={activeView === 'chat'}
				onclick={() => activeView = 'chat'}
			>
				<span class="toggle-icon">C</span>
				Chat
			</button>
			{#if hasTopicContext && activeView === 'curated'}
				<button
					class="curate-btn"
					onclick={triggerCuration}
					disabled={curating || generating}
					title="Have Gideon find and add resources"
				>
					{curating ? '...' : '+'}
				</button>
				<button
					class="write-btn"
					onclick={generateProseContent}
					disabled={curating || generating}
					title="Generate educational prose for this topic"
				>
					{generating ? '...' : 'W'}
				</button>
			{/if}
		</div>

		<!-- Curation/Generation Status -->
		{#if curateMessage}
			<div class="curate-status">
				<span class="curate-dot"></span>
				<span>{curateMessage}</span>
			</div>
		{/if}
		{#if generateMessage}
			<div class="generate-status">
				<span class="generate-dot"></span>
				<span>{generateMessage}</span>
			</div>
		{/if}

		<!-- Content Area -->
		<div class="content-area">
			{#if activeView === 'curated'}
				<!-- Curated Learning Content -->
				<div class="curated-content">
					{#if curatedLoading}
						<div class="loading-state">
							<div class="loading-spinner"></div>
							<span>Loading curated content...</span>
						</div>
					{:else if !hasTopicContext}
						<div class="empty-curated">
							<div class="empty-icon">L</div>
							<p>Navigate to a topic to see curated learning content</p>
						</div>
					{:else if totalCurated === 0 && notifications.length === 0}
						<div class="empty-curated">
							<div class="empty-icon">L</div>
							<p>No curated content yet</p>
							<span class="empty-hint">Ask Gideon questions to get personalized resources</span>
						</div>
					{:else}
						<!-- New Content Notifications -->
						{#if notifications.length > 0}
							<section class="section notifications-section">
								<div class="section-header">
									<h3 class="section-title">
										<span class="title-icon new-icon">N</span>
										What's New
										{#if unseenCount > 0}
											<span class="section-count unseen">{unseenCount} new</span>
										{/if}
									</h3>
									{#if notifications.length > 0}
										<button class="clear-btn" onclick={clearNotifications} title="Clear all">
											Clear
										</button>
									{/if}
								</div>
								<div class="notification-list">
									{#each notifications.slice(0, 5) as notification}
										<a
											href="/topic/{notification.topicId}"
											class="notification-card"
											class:unseen={!notification.seen}
										>
											<div class="notification-type-icon">
												{notification.type === 'prose' ? 'P' :
												 notification.type === 'resource' ? 'R' :
												 notification.type === 'code_example' ? 'C' : 'L'}
											</div>
											<div class="notification-info">
												<span class="notification-title">{notification.title}</span>
												{#if notification.description}
													<span class="notification-desc">{notification.description}</span>
												{/if}
											</div>
											<span class="notification-time">{formatTimeAgo(notification.timestamp)}</span>
										</a>
									{/each}
								</div>
							</section>
						{/if}

						<!-- Recent Activity -->
						{#if recentActivity.length > 0}
							<section class="section activity-section">
								<h3 class="section-title">Recent Agent Activity</h3>
								<div class="activity-feed">
									{#each recentActivity as activity}
										<div class="activity-item">
											<span class="activity-icon-small">{activityIcons[activity.type]}</span>
											<span class="activity-text">{activity.details}</span>
											<span class="activity-time">{formatTimeAgo(activity.timestamp)}</span>
										</div>
									{/each}
								</div>
							</section>
						{/if}

						<!-- Resources -->
						{#if extension && extension.resources.length > 0}
							<section class="section">
								<h3 class="section-title">
									<span class="title-icon">R</span>
									Resources
									<span class="section-count">{extension.resources.length}</span>
								</h3>
								<div class="resource-list">
									{#each extension.resources as resource, idx}
										<a
											href={resource.url}
											target="_blank"
											rel="noopener noreferrer"
											class="resource-card"
											class:ai-added={resource.addedBy === 'ai'}
										>
											<div class="resource-type">{resourceIcons[resource.type]}</div>
											<div class="resource-info">
												<span class="resource-title">{resource.title}</span>
												<span class="resource-meta">
													{resource.type}
													{#if resource.addedBy === 'ai'}
														<span class="ai-badge">AI</span>
													{/if}
												</span>
											</div>
											<span class="resource-arrow">-></span>
										</a>
									{/each}
								</div>
							</section>
						{/if}

						<!-- Code Examples -->
						{#if extension && extension.codeExamples.length > 0}
							<section class="section">
								<h3 class="section-title">
									<span class="title-icon">C</span>
									Code Examples
									<span class="section-count">{extension.codeExamples.length}</span>
								</h3>
								<div class="code-list">
									{#each extension.codeExamples as example, idx}
										<div class="code-card" class:expanded={expandedCode === idx}>
											<button
												class="code-header"
												onclick={() => expandedCode = expandedCode === idx ? null : idx}
											>
												<span class="code-lang">{example.language}</span>
												<span class="code-title">{example.title}</span>
												{#if example.addedBy === 'ai'}
													<span class="ai-badge">AI</span>
												{/if}
												<span class="code-expand">{expandedCode === idx ? '-' : '+'}</span>
											</button>
											{#if expandedCode === idx}
												<div class="code-body">
													<p class="code-explanation">{example.explanation}</p>
													<div class="code-block">
														<button class="copy-code-btn" onclick={() => copyCode(example.code)}>Copy</button>
														<pre><code>{example.code}</code></pre>
													</div>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</section>
						{/if}

						<!-- Generated Lessons -->
						{#if lessons.length > 0}
							<section class="section">
								<h3 class="section-title">
									<span class="title-icon">L</span>
									Lessons
									<span class="section-count">{lessons.length}</span>
								</h3>
								<div class="lesson-list">
									{#each lessons as lesson}
										<div class="lesson-card" class:expanded={expandedLesson === lesson.id}>
											<button
												class="lesson-header"
												onclick={() => expandedLesson = expandedLesson === lesson.id ? null : lesson.id}
											>
												<span class="lesson-difficulty" class:beginner={lesson.difficulty === 'beginner'} class:intermediate={lesson.difficulty === 'intermediate'} class:advanced={lesson.difficulty === 'advanced'}>
													{lesson.difficulty[0].toUpperCase()}
												</span>
												<span class="lesson-title">{lesson.title}</span>
												<span class="ai-badge">AI</span>
												<span class="lesson-expand">{expandedLesson === lesson.id ? '-' : '+'}</span>
											</button>
											{#if expandedLesson === lesson.id}
												<div class="lesson-body">
													<p class="lesson-intro">{lesson.content.introduction}</p>
													{#if lesson.content.concepts.length > 0}
														<div class="lesson-concepts">
															<strong>Key Concepts:</strong>
															<ul>
																{#each lesson.content.concepts as concept}
																	<li>{concept}</li>
																{/each}
															</ul>
														</div>
													{/if}
													<div class="lesson-explanation">
														{@html formatMessage(lesson.content.explanation)}
													</div>
													{#if lesson.content.exercises.length > 0}
														<div class="lesson-exercises">
															<strong>Practice:</strong>
															<ul>
																{#each lesson.content.exercises as exercise}
																	<li>{exercise}</li>
																{/each}
															</ul>
														</div>
													{/if}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</section>
						{/if}
					{/if}
				</div>
			{:else}
				<!-- Chat View -->
				<div class="chat-view">
					{#if !lettaAvailable}
						<div class="unavailable">
							<p>AI tutor is unavailable</p>
							<span>Start the Letta server on localhost:8283</span>
						</div>
					{:else}
						{#if currentThinking && showThinking}
							<div class="thinking-bar">
								<span class="thinking-dot"></span>
								<span class="thinking-text">{currentThinking.slice(0, 80)}...</span>
							</div>
						{/if}

						<div class="messages" bind:this={messagesContainer}>
							{#if messages.length === 0}
								<div class="empty-state">
									<p class="empty-title">Ask Gideon</p>
									<p class="empty-desc">Questions about {contextTitle}</p>
									<div class="quick-actions">
										<button onclick={() => { input = "Explain this topic simply"; sendMessage(); }}>
											Explain
										</button>
										<button onclick={() => { input = "Create a practical code example for this"; sendMessage(); }}>
											Code
										</button>
										<button onclick={() => { input = "Find and add good learning resources"; sendMessage(); }}>
											Curate
										</button>
									</div>
									<div class="quick-actions secondary">
										<button onclick={() => { input = "What content is missing? Fill the gaps."; sendMessage(); }}>
											Fill gaps
										</button>
										<button onclick={() => { input = "Write a beginner-friendly lesson"; sendMessage(); }}>
											Lesson
										</button>
									</div>
								</div>
							{:else}
								{#each messages as message, idx}
									{#if 'type' in message && message.type === 'activity'}
										<div class="activity-msg">
											<span class="activity-icon">{activityIcons[message.action]}</span>
											<span>{message.details}</span>
										</div>
									{:else if 'role' in message}
										<div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
											<div class="message-bubble">
												{@html formatMessage(message.content)}
											</div>
											<button
												class="copy-msg-btn"
												onclick={() => copyMessage(message.content, idx)}
												title="Copy"
											>
												{copiedIdx === idx ? '~' : 'C'}
											</button>
										</div>
									{/if}
								{/each}
							{/if}

							{#if loading}
								<div class="message assistant">
									<div class="message-bubble">
										<div class="typing"><span></span><span></span><span></span></div>
									</div>
								</div>
							{/if}

							{#if error}
								<div class="error-msg">{error}</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Input Bar (always visible) -->
		<form class="input-bar" onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
			<input
				type="text"
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="Ask Gideon for resources, explanations..."
				disabled={loading}
			/>
			{#if loading}
				<button type="button" class="send-btn stop" onclick={stopGeneration} aria-label="Stop">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
						<rect x="6" y="6" width="12" height="12" rx="2"/>
					</svg>
				</button>
			{:else}
				<button type="submit" class="send-btn" disabled={!input.trim()} aria-label="Send">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
					</svg>
				</button>
			{/if}
		</form>
	</div>
</div>

<style>
	.floating-chat {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 1000;
		font-family: 'DM Sans', system-ui, sans-serif;
	}

	/* FAB Button */
	.fab {
		width: 56px;
		height: 56px;
		border-radius: 28px;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		border: none;
		box-shadow:
			0 4px 16px rgba(16, 185, 129, 0.4),
			0 2px 4px rgba(0, 0, 0, 0.2),
			inset 0 1px 1px rgba(255, 255, 255, 0.2);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}

	.fab:hover {
		transform: scale(1.05);
		box-shadow:
			0 6px 24px rgba(16, 185, 129, 0.5),
			0 4px 8px rgba(0, 0, 0, 0.2);
	}

	.fab:active {
		transform: scale(0.98);
	}

	.fab.hidden {
		opacity: 0;
		pointer-events: none;
		transform: scale(0.8);
	}

	.fab-icon {
		color: white;
		display: flex;
	}

	.fab-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 20px;
		height: 20px;
		background: #6366f1;
		color: white;
		font-size: 11px;
		font-weight: 600;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 6px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.fab-badge.unseen {
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		animation: fab-pulse 2s ease-in-out infinite;
	}

	@keyframes fab-pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.1); }
	}

	.fab.has-unseen {
		animation: fab-glow 2s ease-in-out infinite;
	}

	@keyframes fab-glow {
		0%, 100% { box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2); }
		50% { box-shadow: 0 4px 24px rgba(245, 158, 11, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3); }
	}

	/* Learning Panel */
	.learning-panel {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 420px;
		height: 680px;
		background: rgba(17, 17, 23, 0.97);
		backdrop-filter: blur(20px);
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.4),
			0 8px 16px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		opacity: 0;
		transform: translateY(20px) scale(0.95);
		pointer-events: none;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.learning-panel.visible {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}

	/* Panel Header */
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%);
		border-bottom: 1px solid rgba(16, 185, 129, 0.2);
		flex-shrink: 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.agent-avatar {
		width: 32px;
		height: 32px;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 14px;
		color: white;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.agent-name {
		font-weight: 600;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.95);
	}

	.context-tag {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.curated-badge {
		font-size: 10px;
		padding: 4px 10px;
		background: rgba(16, 185, 129, 0.2);
		color: #6ee7b7;
		border-radius: 12px;
		font-weight: 600;
	}

	.header-btn {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.header-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
	}

	/* Learning Goal Bar */
	.goal-bar {
		padding: 8px 12px;
		background: rgba(251, 191, 36, 0.08);
		border-bottom: 1px solid rgba(251, 191, 36, 0.15);
		flex-shrink: 0;
	}

	.goal-display {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		background: transparent;
		border: 1px dashed rgba(251, 191, 36, 0.3);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.goal-display:hover {
		background: rgba(251, 191, 36, 0.1);
		border-color: rgba(251, 191, 36, 0.5);
	}

	.goal-icon {
		font-size: 14px;
		flex-shrink: 0;
	}

	.goal-text {
		flex: 1;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.7);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.goal-edit-hint {
		font-size: 9px;
		color: rgba(251, 191, 36, 0.6);
		padding: 2px 6px;
		background: rgba(251, 191, 36, 0.15);
		border-radius: 4px;
		opacity: 0;
		transition: opacity 0.15s;
		flex-shrink: 0;
	}

	.goal-display:hover .goal-edit-hint {
		opacity: 1;
	}

	.goal-edit {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.goal-input {
		width: 100%;
		padding: 8px 10px;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(251, 191, 36, 0.4);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.95);
		font-size: 11px;
		outline: none;
		transition: border-color 0.15s;
	}

	.goal-input:focus {
		border-color: rgba(251, 191, 36, 0.7);
	}

	.goal-input::placeholder {
		color: rgba(255, 255, 255, 0.35);
	}

	.goal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}

	.goal-btn {
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.goal-btn.save {
		background: rgba(251, 191, 36, 0.2);
		border: 1px solid rgba(251, 191, 36, 0.4);
		color: #fcd34d;
	}

	.goal-btn.save:hover:not(:disabled) {
		background: rgba(251, 191, 36, 0.3);
	}

	.goal-btn.save:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.goal-btn.cancel {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.5);
	}

	.goal-btn.cancel:hover {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.8);
	}

	/* View Toggle */
	.view-toggle {
		display: flex;
		gap: 4px;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}

	.toggle-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 12px;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.toggle-btn:hover {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.8);
	}

	.toggle-btn.active {
		background: rgba(16, 185, 129, 0.15);
		border-color: rgba(16, 185, 129, 0.4);
		color: #6ee7b7;
	}

	.toggle-icon {
		width: 18px;
		height: 18px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 700;
	}

	.toggle-btn.active .toggle-icon {
		background: rgba(16, 185, 129, 0.3);
	}

	.toggle-count {
		font-size: 10px;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
	}

	.curate-btn {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		border: none;
		color: white;
		font-size: 18px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.curate-btn:hover:not(:disabled) {
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
	}

	.curate-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.write-btn {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
		border: none;
		color: white;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.write-btn:hover:not(:disabled) {
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
	}

	.write-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.curate-status {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(16, 185, 129, 0.1);
		border-bottom: 1px solid rgba(16, 185, 129, 0.15);
		font-size: 11px;
		color: #6ee7b7;
		flex-shrink: 0;
	}

	.curate-dot {
		width: 6px;
		height: 6px;
		background: #10b981;
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.generate-status {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(99, 102, 241, 0.1);
		border-bottom: 1px solid rgba(99, 102, 241, 0.15);
		font-size: 11px;
		color: #a5b4fc;
		flex-shrink: 0;
	}

	.generate-dot {
		width: 6px;
		height: 6px;
		background: #6366f1;
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	/* Content Area */
	.content-area {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Curated Content */
	.curated-content {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
	}

	.curated-content::-webkit-scrollbar {
		width: 6px;
	}

	.curated-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.curated-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(16, 185, 129, 0.2);
		border-top-color: #10b981;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-curated {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 40px 20px;
		color: rgba(255, 255, 255, 0.5);
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		background: rgba(16, 185, 129, 0.1);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 700;
		color: #10b981;
		margin-bottom: 12px;
	}

	.empty-curated p {
		font-size: 14px;
		margin-bottom: 4px;
	}

	.empty-hint {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.35);
	}

	/* Sections */
	.section {
		margin-bottom: 16px;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 10px;
		padding: 0 4px;
	}

	.title-icon {
		width: 18px;
		height: 18px;
		background: rgba(16, 185, 129, 0.2);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		color: #10b981;
	}

	.section-count {
		margin-left: auto;
		font-size: 10px;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		font-weight: 500;
	}

	/* Activity Section */
	.activity-section {
		background: rgba(255, 255, 255, 0.02);
		border-radius: 10px;
		padding: 10px;
		margin-bottom: 16px;
	}

	.activity-feed {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.activity-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		font-size: 11px;
	}

	.activity-icon-small {
		width: 16px;
		height: 16px;
		background: rgba(16, 185, 129, 0.2);
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		font-weight: 700;
		color: #10b981;
		flex-shrink: 0;
	}

	.activity-text {
		flex: 1;
		color: rgba(255, 255, 255, 0.7);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.activity-time {
		color: rgba(255, 255, 255, 0.35);
		font-size: 10px;
		flex-shrink: 0;
	}

	/* Notifications Section */
	.notifications-section {
		background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
		border-radius: 10px;
		padding: 10px;
		margin-bottom: 16px;
		border: 1px solid rgba(99, 102, 241, 0.15);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.section-header .section-title {
		margin-bottom: 0;
	}

	.new-icon {
		background: rgba(99, 102, 241, 0.3);
		color: #a5b4fc;
	}

	.section-count.unseen {
		background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
		color: white;
		animation: pulse 2s ease-in-out infinite;
	}

	.toggle-count.unseen {
		background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
		color: white;
		font-weight: 600;
	}

	.clear-btn {
		padding: 4px 10px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.clear-btn:hover {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.3);
		color: #f87171;
	}

	.notification-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.notification-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		text-decoration: none;
		transition: all 0.15s;
	}

	.notification-card:hover {
		background: rgba(0, 0, 0, 0.3);
		border-color: rgba(99, 102, 241, 0.4);
		transform: translateX(4px);
	}

	.notification-card.unseen {
		border-left: 3px solid #6366f1;
		background: rgba(99, 102, 241, 0.08);
	}

	.notification-type-icon {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		background: rgba(99, 102, 241, 0.2);
		color: #a5b4fc;
		flex-shrink: 0;
	}

	.notification-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.notification-title {
		font-size: 12px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.notification-desc {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.45);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.notification-time {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.35);
		flex-shrink: 0;
	}

	/* Resource Cards */
	.resource-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.resource-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		text-decoration: none;
		transition: all 0.15s;
	}

	.resource-card:hover {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(16, 185, 129, 0.3);
	}

	.resource-card.ai-added {
		border-left: 2px solid #10b981;
	}

	.resource-type {
		width: 28px;
		height: 28px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.6);
		flex-shrink: 0;
	}

	.resource-info {
		flex: 1;
		min-width: 0;
	}

	.resource-title {
		display: block;
		font-size: 12px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.resource-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.4);
		text-transform: uppercase;
		margin-top: 2px;
	}

	.ai-badge {
		font-size: 9px;
		padding: 1px 5px;
		background: rgba(16, 185, 129, 0.2);
		color: #6ee7b7;
		border-radius: 4px;
		font-weight: 600;
	}

	.resource-arrow {
		color: rgba(255, 255, 255, 0.3);
		font-size: 12px;
		flex-shrink: 0;
	}

	/* Code Cards */
	.code-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.code-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		overflow: hidden;
		transition: all 0.15s;
	}

	.code-card.expanded {
		border-color: rgba(16, 185, 129, 0.3);
	}

	.code-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.code-lang {
		font-size: 9px;
		padding: 2px 6px;
		background: rgba(139, 92, 246, 0.2);
		color: #a78bfa;
		border-radius: 4px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.code-title {
		flex: 1;
		font-size: 12px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.code-expand {
		width: 20px;
		height: 20px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.5);
	}

	.code-body {
		padding: 0 12px 12px;
	}

	.code-explanation {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.5;
		margin-bottom: 10px;
	}

	.code-block {
		position: relative;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 6px;
		overflow: hidden;
	}

	.copy-code-btn {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 4px 8px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.6);
		font-size: 10px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.copy-code-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.9);
	}

	.code-block pre {
		margin: 0;
		padding: 12px;
		overflow-x: auto;
	}

	.code-block code {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 11px;
		line-height: 1.5;
		color: #e2e8f0;
	}

	/* Lesson Cards */
	.lesson-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.lesson-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		overflow: hidden;
		transition: all 0.15s;
	}

	.lesson-card.expanded {
		border-color: rgba(99, 102, 241, 0.3);
	}

	.lesson-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.lesson-difficulty {
		width: 20px;
		height: 20px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 700;
	}

	.lesson-difficulty.beginner {
		background: rgba(16, 185, 129, 0.2);
		color: #6ee7b7;
	}

	.lesson-difficulty.intermediate {
		background: rgba(251, 191, 36, 0.2);
		color: #fcd34d;
	}

	.lesson-difficulty.advanced {
		background: rgba(239, 68, 68, 0.2);
		color: #fca5a5;
	}

	.lesson-title {
		flex: 1;
		font-size: 12px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.lesson-expand {
		width: 20px;
		height: 20px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.5);
	}

	.lesson-body {
		padding: 0 12px 12px;
	}

	.lesson-intro {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.5;
		margin-bottom: 12px;
		font-style: italic;
	}

	.lesson-concepts,
	.lesson-exercises {
		margin-bottom: 12px;
	}

	.lesson-concepts strong,
	.lesson-exercises strong {
		display: block;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		margin-bottom: 6px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.lesson-concepts ul,
	.lesson-exercises ul {
		margin: 0;
		padding-left: 16px;
	}

	.lesson-concepts li,
	.lesson-exercises li {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 4px;
		line-height: 1.4;
	}

	.lesson-explanation {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.6;
		margin-bottom: 12px;
	}

	/* Chat View */
	.chat-view {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.unavailable {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 40px;
	}

	.unavailable p {
		color: rgba(255, 255, 255, 0.7);
		font-size: 14px;
		margin-bottom: 8px;
	}

	.unavailable span {
		color: rgba(255, 255, 255, 0.4);
		font-size: 12px;
	}

	.thinking-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: rgba(99, 102, 241, 0.1);
		border-bottom: 1px solid rgba(99, 102, 241, 0.15);
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		flex-shrink: 0;
	}

	.thinking-dot {
		width: 6px;
		height: 6px;
		background: #6366f1;
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.4; transform: scale(0.9); }
		50% { opacity: 1; transform: scale(1.1); }
	}

	.thinking-text {
		flex: 1;
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.messages::-webkit-scrollbar {
		width: 6px;
	}

	.messages::-webkit-scrollbar-track {
		background: transparent;
	}

	.messages::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}

	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 16px;
	}

	.empty-title {
		font-size: 14px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		margin-bottom: 4px;
	}

	.empty-desc {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.4);
		margin-bottom: 16px;
	}

	.quick-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: center;
	}

	.quick-actions button {
		padding: 8px 14px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.quick-actions button:hover {
		background: rgba(16, 185, 129, 0.1);
		border-color: rgba(16, 185, 129, 0.4);
		color: #6ee7b7;
	}

	.quick-actions.secondary {
		margin-top: 4px;
	}

	.quick-actions.secondary button {
		background: rgba(99, 102, 241, 0.05);
		border-color: rgba(99, 102, 241, 0.15);
		color: rgba(165, 180, 252, 0.7);
	}

	.quick-actions.secondary button:hover {
		background: rgba(99, 102, 241, 0.1);
		border-color: rgba(99, 102, 241, 0.4);
		color: #a5b4fc;
	}

	.activity-msg {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
	}

	.activity-icon {
		width: 18px;
		height: 18px;
		background: rgba(16, 185, 129, 0.2);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 600;
		color: #10b981;
	}

	.message {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		max-width: 85%;
		position: relative;
	}

	.message.user {
		align-self: flex-end;
		flex-direction: row-reverse;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-bubble {
		padding: 10px 14px;
		border-radius: 14px;
		font-size: 13px;
		line-height: 1.5;
	}

	.message.user .message-bubble {
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		color: white;
		border-bottom-right-radius: 4px;
	}

	.message.assistant .message-bubble {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
		border-bottom-left-radius: 4px;
	}

	.copy-msg-btn {
		opacity: 0;
		width: 24px;
		height: 24px;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 10px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
		margin-top: 4px;
	}

	.message:hover .copy-msg-btn {
		opacity: 1;
	}

	.copy-msg-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.9);
	}

	.message-bubble :global(code) {
		background: rgba(0, 0, 0, 0.3);
		padding: 2px 6px;
		border-radius: 4px;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 0.9em;
	}

	.message-bubble :global(pre) {
		background: rgba(0, 0, 0, 0.4);
		padding: 12px;
		border-radius: 8px;
		overflow-x: auto;
		margin: 8px 0;
	}

	.message-bubble :global(pre code) {
		background: none;
		padding: 0;
	}

	.typing {
		display: flex;
		gap: 4px;
		padding: 4px 0;
	}

	.typing span {
		width: 8px;
		height: 8px;
		background: rgba(255, 255, 255, 0.4);
		border-radius: 50%;
		animation: typing 1.4s ease-in-out infinite;
	}

	.typing span:nth-child(2) { animation-delay: 0.2s; }
	.typing span:nth-child(3) { animation-delay: 0.4s; }

	@keyframes typing {
		0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
		40% { transform: scale(1); opacity: 1; }
	}

	.error-msg {
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
		padding: 10px 14px;
		border-radius: 10px;
		font-size: 12px;
		text-align: center;
	}

	/* Input Bar */
	.input-bar {
		display: flex;
		gap: 8px;
		padding: 12px 16px;
		background: rgba(255, 255, 255, 0.02);
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}

	.input-bar input {
		flex: 1;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		padding: 10px 14px;
		color: rgba(255, 255, 255, 0.95);
		font-size: 13px;
		outline: none;
		transition: all 0.15s;
	}

	.input-bar input:focus {
		border-color: rgba(16, 185, 129, 0.5);
		background: rgba(255, 255, 255, 0.08);
	}

	.input-bar input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.send-btn {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		border: none;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.send-btn:hover:not(:disabled) {
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
	}

	.send-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
	}

	.send-btn.stop {
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
	}

	.send-btn.stop:hover {
		box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
	}
</style>
