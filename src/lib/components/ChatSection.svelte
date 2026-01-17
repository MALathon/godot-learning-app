<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Topic } from '$lib/data/topics';
	import type { TopicProgress } from '$lib/server/storage';

	interface Props {
		topic?: Topic;
		progress?: TopicProgress;
		notes?: string;
	}

	let { topic, progress, notes = '' }: Props = $props();

	// Context-aware state
	const hasTopicContext = $derived(!!topic);
	const contextTitle = $derived(topic?.title ?? 'General');
	const contextId = $derived(topic?.id ?? 'general');

	// Message types for the enhanced chat
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

	interface ThinkingMessage {
		type: 'thinking';
		content: string;
		timestamp: string;
	}

	type Message = ChatMessage | ActivityMessage | ThinkingMessage;

	// State
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
	let newContentCount = $state(0);
	let showMemoryPanel = $state(false);
	let memoryBlocks = $state<Array<{ label: string; value: string; isShared: boolean }>>([]);

	// Derived values
	const exercisesCompleted = $derived(
		progress?.exercisesCompleted?.filter(Boolean).length ?? 0
	);
	const totalExercises = $derived(topic?.exercises?.length ?? 0);
	const lastVisited = $derived(progress?.lastVisited ?? null);

	onMount(async () => {
		// Only load notebook for topic-specific contexts
		if (hasTopicContext) {
			await loadNotebook();
			await checkNewContent();
		}
	});

	// Reload notebook when topic changes (only for topic contexts)
	$effect(() => {
		if (hasTopicContext && contextId) {
			loadNotebook().catch(e => {
				console.error('Failed to load notebook:', e);
			});
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

	async function checkNewContent() {
		if (!hasTopicContext) return;
		try {
			const response = await fetch(`/api/letta/activity?topicId=${contextId}&limit=10`);
			if (response.ok) {
				const data = await response.json();
				// Count activities since last visit
				if (lastVisited && data.activities) {
					const lastVisitTime = new Date(lastVisited).getTime();
					newContentCount = data.activities.filter(
						(a: { timestamp: string }) => new Date(a.timestamp).getTime() > lastVisitTime
					).length;
				}
			}
		} catch (e) {
			console.error('Failed to check new content:', e);
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

		abortController = new AbortController();

		// Add user message
		messages = [...messages, {
			role: 'user',
			content: userMessage,
			timestamp: new Date().toISOString()
		}];
		await scrollToBottom();

		// Add placeholder for assistant response
		messages = [...messages, {
			role: 'assistant',
			content: '',
			timestamp: new Date().toISOString()
		}];

		try {
			const requestBody: Record<string, unknown> = {
				topicId: contextId,
				message: userMessage,
				stream: true
			};

			// Add topic context only if we have a topic
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
								// Show thinking in the UI
								if (showThinking && data.reasoning) {
									currentThinking = data.reasoning;
								}
								break;

							case 'tool':
								// Add activity message
								if (data.name && data.name !== 'send_message') {
									const activityMsg: ActivityMessage = {
										type: 'activity',
										action: mapToolToAction(data.name),
										details: formatToolDetails(data.name, data.title || data.result),
										timestamp: new Date().toISOString()
									};
									// Insert before the assistant response
									const lastIdx = messages.length - 1;
									messages = [
										...messages.slice(0, lastIdx),
										activityMsg,
										messages[lastIdx]
									];
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
			case 'web_search':
				return 'Searching for resources...';
			case 'add_resource':
				return result ? `Added resource: ${result}` : 'Adding resource...';
			case 'add_code_example':
				return result ? `Added code example: ${result}` : 'Adding code example...';
			case 'add_lesson':
				return result ? `Generated lesson: ${result}` : 'Generating lesson...';
			case 'get_topics':
				return 'Checking curriculum...';
			case 'get_conversation_details':
				return 'Reviewing conversation history...';
			case 'get_current_extensions':
				return 'Checking existing content...';
			case 'get_student_progress':
				return 'Checking your progress...';
			case 'get_student_notes':
				return 'Reading your notes...';
			default:
				return result || `Using ${toolName}...`;
		}
	}

	async function clearChat() {
		if (!confirm('Clear all chat history?')) return;

		try {
			await fetch(`/api/notebook/${contextId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clear' })
			});
			messages = [];
		} catch (e) {
			console.error('Failed to clear chat:', e);
		}
	}


	let resetting = $state(false);

	async function loadMemory() {
		try {
			const response = await fetch('/api/letta/memory?agent=gideon');
			if (response.ok) {
				const data = await response.json();
				memoryBlocks = data.memoryBlocks || [];
			}
		} catch (e) {
			console.error('Failed to load memory:', e);
		}
	}

	async function resetMemory() {
		if (!confirm('Reset all agent memory? This will clear learning progress and curated content tracking.')) return;

		resetting = true;
		try {
			const response = await fetch('/api/letta/reset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ agent: 'all', blocks: 'all' })
			});
			if (response.ok) {
				await loadMemory();
			}
		} catch (e) {
			console.error('Failed to reset memory:', e);
		} finally {
			resetting = false;
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

	function formatTimeAgo(timestamp: string | null): string {
		if (!timestamp) return 'Never';
		const now = new Date().getTime();
		const then = new Date(timestamp).getTime();
		const diff = now - then;

		const minutes = Math.floor(diff / 60000);
		if (minutes < 60) return `${minutes}m ago`;

		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;

		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	const activityIcons: Record<string, string> = {
		search: 'S',
		add_resource: 'R',
		add_code_example: 'C',
		add_lesson: 'L',
		thinking: 'T'
	};
</script>

<div class="chat-section">
	<header class="section-header">
		<div class="header-left">
			<span class="agent-name">Gideon</span>
			<span class="topic-context">{contextTitle}</span>
		</div>
		<div class="header-actions">
			<button
				class="icon-btn"
				onclick={() => { showMemoryPanel = !showMemoryPanel; if (showMemoryPanel) loadMemory(); }}
				title="Agent memory"
			>
				M
			</button>
			<button class="icon-btn" onclick={clearChat} title="Clear chat">
				X
			</button>
		</div>
	</header>

	<!-- Context Bar -->
	{#if hasTopicContext}
		<div class="context-bar">
			<span class="context-item">
				<span class="context-label">Progress:</span>
				<span class="context-value">{exercisesCompleted}/{totalExercises}</span>
			</span>
			<span class="context-item">
				<span class="context-label">Last:</span>
				<span class="context-value">{formatTimeAgo(lastVisited)}</span>
			</span>
			{#if newContentCount > 0}
				<span class="new-content-indicator" title="Curator added new content">
					+{newContentCount} new
				</span>
			{/if}
		</div>
	{:else}
		<div class="context-bar">
			<span class="context-item">
				<span class="context-value">Ask anything about Godot internals</span>
			</span>
		</div>
	{/if}

	<!-- Memory Panel (overlay) -->
	{#if showMemoryPanel}
		<div class="memory-panel">
			<div class="memory-header">
				<span>What Gideon Knows</span>
				<div class="memory-actions">
					<button class="reset-btn" onclick={resetMemory} disabled={resetting}>
						{resetting ? '...' : 'Reset'}
					</button>
					<button onclick={() => showMemoryPanel = false}>x</button>
				</div>
			</div>
			<div class="memory-content">
				{#each memoryBlocks as block}
					<div class="memory-block" class:shared={block.isShared}>
						<div class="memory-label">
							{block.label}
							{#if block.isShared}
								<span class="shared-badge">Shared</span>
							{/if}
						</div>
						<div class="memory-value">{block.value.slice(0, 200)}{block.value.length > 200 ? '...' : ''}</div>
					</div>
				{/each}
				{#if memoryBlocks.length === 0}
					<p class="no-memory">Unable to load agent memory</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if !lettaAvailable}
		<div class="no-api-key">
			<p>AI tutor is unavailable. The Letta server may not be running.</p>
			<p class="hint">Start the Letta server on localhost:8283</p>
		</div>
	{:else}
		<!-- Thinking indicator -->
		{#if currentThinking && showThinking}
			<div class="thinking-bubble">
				<span class="thinking-icon">T</span>
				<span class="thinking-text">{currentThinking.slice(0, 150)}{currentThinking.length > 150 ? '...' : ''}</span>
			</div>
		{/if}

		<div class="messages" bind:this={messagesContainer}>
			{#if messages.length === 0}
				<div class="empty-state">
					{#if hasTopicContext}
						<p>Ask questions about <strong>{contextTitle}</strong></p>
						<div class="suggestions">
							<button onclick={() => { input = "Explain this concept in simple terms"; sendMessage(); }}>
								Explain simply
							</button>
							<button onclick={() => { input = "Show me a practical example"; sendMessage(); }}>
								Show example
							</button>
							<button onclick={() => { input = "How does this relate to my game?"; sendMessage(); }}>
								Connect to my code
							</button>
						</div>
					{:else}
						<p>I'm <strong>Gideon</strong>, your Godot learning companion</p>
						<div class="suggestions">
							<button onclick={() => { input = "What should I learn first?"; sendMessage(); }}>
								Where to start
							</button>
							<button onclick={() => { input = "Explain Godot's architecture"; sendMessage(); }}>
								Godot architecture
							</button>
							<button onclick={() => { input = "What topics have I completed?"; sendMessage(); }}>
								My progress
							</button>
						</div>
					{/if}
				</div>
			{:else}
				{#each messages as message}
					{#if 'type' in message && message.type === 'activity'}
						<!-- Activity message -->
						<div class="activity-message">
							<span class="activity-icon">{activityIcons[message.action]}</span>
							<span class="activity-text">{message.details}</span>
						</div>
					{:else if 'role' in message}
						<!-- Chat message -->
						<div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
							<div class="message-content">
								{@html formatMessage(message.content)}
							</div>
						</div>
					{/if}
				{/each}
			{/if}

			{#if loading}
				<div class="message assistant loading">
					<div class="typing-indicator">
						<span></span>
						<span></span>
						<span></span>
					</div>
				</div>
			{/if}

			{#if error}
				<div class="error-message">
					{error}
				</div>
			{/if}
		</div>

		<form class="input-area" onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
			<input
				type="text"
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder={hasTopicContext ? `Ask about ${contextTitle}...` : "Ask about Godot internals..."}
				disabled={loading}
			/>
			{#if loading}
				<button type="button" class="stop-btn" onclick={stopGeneration}>
					Stop
				</button>
			{:else}
				<button type="submit" disabled={!input.trim()}>
					&gt;
				</button>
			{/if}
		</form>
	{/if}
</div>

<style>
	.chat-section {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-secondary);
		overflow: hidden;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
		flex-shrink: 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.agent-name {
		font-weight: 600;
		color: var(--accent);
		font-size: var(--text-sm);
	}

	.topic-context {
		font-weight: 500;
		color: var(--text-secondary);
		font-size: var(--text-xs);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.icon-btn {
		background: transparent;
		color: var(--text-muted);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		border: none;
		border-radius: var(--radius-sm);
	}

	.icon-btn:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	/* Context Bar */
	.context-bar {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		background: var(--bg-primary);
		border-bottom: 1px solid var(--border-subtle);
		font-size: var(--text-xs);
		flex-shrink: 0;
	}

	.context-item {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.context-label {
		color: var(--text-muted);
	}

	.context-value {
		color: var(--text-secondary);
		font-weight: 500;
	}

	.new-content-indicator {
		margin-left: auto;
		padding: 2px 8px;
		background: var(--success-muted, rgba(48, 209, 88, 0.15));
		color: var(--success);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 500;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	/* Memory Panel */
	.memory-panel {
		position: absolute;
		top: 60px;
		left: var(--space-3);
		right: var(--space-3);
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		z-index: 10;
		max-height: 300px;
		overflow: hidden;
	}

	.memory-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border-subtle);
		font-weight: 500;
		font-size: var(--text-sm);
	}

	.memory-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.memory-header button {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.reset-btn {
		font-size: var(--text-xs);
		padding: 2px 8px;
		background: var(--error-muted, rgba(255, 69, 58, 0.15)) !important;
		color: var(--error) !important;
		border-radius: var(--radius-sm);
	}

	.reset-btn:hover:not(:disabled) {
		background: var(--error) !important;
		color: white !important;
	}

	.reset-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.memory-content {
		padding: var(--space-2);
		max-height: 250px;
		overflow-y: auto;
	}

	.memory-block {
		padding: var(--space-2);
		margin-bottom: var(--space-2);
		background: var(--bg-secondary);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-subtle);
	}

	.memory-block.shared {
		border-color: var(--accent-muted);
	}

	.memory-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-secondary);
		margin-bottom: var(--space-1);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.shared-badge {
		font-size: 9px;
		padding: 1px 4px;
		background: var(--accent-muted);
		color: var(--accent);
		border-radius: 2px;
	}

	.memory-value {
		font-size: var(--text-xs);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.no-memory {
		text-align: center;
		color: var(--text-muted);
		font-size: var(--text-xs);
		padding: var(--space-4);
	}

	/* Thinking Bubble */
	.thinking-bubble {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: rgba(10, 132, 255, 0.1);
		border-bottom: 1px solid var(--border-subtle);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.thinking-icon {
		background: var(--accent-muted);
		color: var(--accent);
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.thinking-text {
		line-height: 1.4;
		font-style: italic;
	}

	/* Activity Messages */
	.activity-message {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
		margin: var(--space-1) 0;
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.activity-icon {
		background: var(--bg-hover);
		color: var(--text-muted);
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 600;
	}

	.activity-text {
		flex: 1;
	}

	.no-api-key {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-6);
		text-align: center;
	}

	.no-api-key p {
		color: var(--text-secondary);
		margin-bottom: var(--space-2);
		font-size: var(--text-sm);
	}

	.no-api-key .hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.empty-state {
		text-align: center;
		padding: var(--space-6) var(--space-4);
	}

	.empty-state p {
		color: var(--text-secondary);
		margin-bottom: var(--space-4);
		font-size: var(--text-sm);
	}

	.suggestions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.suggestions button {
		background: var(--bg-elevated);
		color: var(--text-secondary);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		font-size: var(--text-xs);
		text-align: left;
		border-radius: var(--radius-md);
	}

	.suggestions button:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--accent);
	}

	.message {
		max-width: 85%;
	}

	.message.user {
		align-self: flex-end;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-content {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.message.user .message-content {
		background: var(--accent);
		color: white;
		border-bottom-right-radius: var(--radius-sm);
	}

	.message.assistant .message-content {
		background: var(--bg-elevated);
		color: var(--text-primary);
		border-bottom-left-radius: var(--radius-sm);
	}

	.message-content :global(code) {
		background: rgba(0, 0, 0, 0.2);
		padding: 1px 4px;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.message-content :global(pre) {
		background: rgba(0, 0, 0, 0.3);
		padding: var(--space-2);
		border-radius: var(--radius-md);
		overflow-x: auto;
		margin: var(--space-2) 0;
	}

	.message-content :global(pre code) {
		background: none;
		padding: 0;
	}

	.typing-indicator {
		display: flex;
		gap: 4px;
		padding: var(--space-2) var(--space-3);
	}

	.typing-indicator span {
		width: 8px;
		height: 8px;
		background: var(--text-muted);
		border-radius: 50%;
		animation: typing 1.4s infinite ease-in-out both;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%, 80%, 100% {
			transform: scale(0.6);
			opacity: 0.4;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.error-message {
		background: rgba(255, 69, 58, 0.15);
		color: var(--error);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-xs);
		text-align: center;
	}

	.input-area {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-3);
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
		flex-shrink: 0;
	}

	.input-area input {
		flex: 1;
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: 8px;
		padding: var(--space-2) var(--space-3);
		color: var(--text-primary);
		font-size: var(--text-sm);
	}

	.input-area input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.input-area input::placeholder {
		color: var(--text-muted);
	}

	.input-area button {
		padding: var(--space-2) var(--space-3);
		background: var(--accent);
		color: white;
		font-weight: 600;
		border-radius: 8px;
	}

	.input-area button:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.input-area button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.stop-btn {
		background: var(--error) !important;
	}

	.stop-btn:hover {
		background: #ff6b5a !important;
	}
</style>
