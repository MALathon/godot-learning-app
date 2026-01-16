<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Topic } from '$lib/data/topics';

	let { topic }: { topic: Topic } = $props();

	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
		timestamp: string;
	}

	let expanded = $state(false);
	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lettaAvailable = $state(true); // Assume available, show error if not
	let messagesContainer: HTMLElement | null = $state(null);
	let abortController: AbortController | null = $state(null);

	onMount(async () => {
		await loadNotebook();
	});

	// Reload notebook when topic changes
	$effect(() => {
		if (topic.id) {
			loadNotebook().catch(e => {
				console.error('Failed to load notebook:', e);
			});
		}
	});

	async function loadNotebook() {
		try {
			const response = await fetch(`/api/notebook/${topic.id}`);
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
		}
	}

	async function sendMessage() {
		if (!input.trim() || loading) return;

		const userMessage = input.trim();
		input = '';
		loading = true;
		error = null;

		// Create abort controller for this request
		abortController = new AbortController();

		// Optimistically add user message
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
			// Use Letta agent for chat (has persistent memory + knowledge base)
			const response = await fetch('/api/chat-letta', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: abortController.signal,
				body: JSON.stringify({
					topicId: topic.id,
					message: userMessage,
					stream: true,
					topicContext: {
						title: topic.title,
						category: topic.category
					}
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to get response');
			}

			// Handle SSE streaming
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
								// Update the last message (assistant) with new text
								messages = messages.map((m, i) =>
									i === messages.length - 1
										? { ...m, content: m.content + data.text }
										: m
								);
								await scrollToBottom();
								break;

							case 'tool':
								// Tool was used - could show notification
								console.log('Tool used:', data.name, data.title);
								break;

							case 'done':
								// Final update with complete notebook
								messages = data.notebook.messages;
								break;

							case 'error':
								throw new Error(data.error);
						}
					}
				}
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') {
				// User stopped generation - keep partial response if any
				const lastMessage = messages[messages.length - 1];
				if (lastMessage.role === 'assistant' && !lastMessage.content) {
					// Remove empty placeholder
					messages = messages.slice(0, -1);
				}
			} else {
				const errorMessage = e instanceof Error ? e.message : 'Something went wrong';
				error = errorMessage;
				// Remove the placeholder messages on error
				messages = messages.slice(0, -2);

				// Check if Letta server is unavailable
				if (errorMessage.includes('Letta') || errorMessage.includes('fetch')) {
					lettaAvailable = false;
				}
			}
		} finally {
			loading = false;
			abortController = null;
			await scrollToBottom();
		}
	}

	async function clearChat() {
		if (!confirm('Clear all chat history for this topic?')) return;

		try {
			await fetch(`/api/notebook/${topic.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clear' })
			});
			messages = [];
		} catch (e) {
			console.error('Failed to clear chat:', e);
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

	/**
	 * Escape HTML to prevent XSS attacks.
	 */
	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Format message content with basic markdown support.
	 * Escapes HTML first to prevent XSS, then applies formatting.
	 */
	function formatMessage(content: string): string {
		// First escape HTML to prevent XSS
		const escaped = escapeHtml(content);

		return escaped
			// Code blocks: ```lang\ncode``` -> <pre><code>code</code></pre>
			.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
			// Inline code: `code` -> <code>code</code>
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			// Bold: **text** -> <strong>text</strong>
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			// Line breaks
			.replace(/\n/g, '<br>');
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (expanded && !target.closest('.chat-panel') && !target.closest('.chat-bubble')) {
			expanded = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<!-- Collapsed: Minimal bubble -->
{#if !expanded}
	<button
		class="chat-bubble"
		onclick={(e) => { e.stopPropagation(); expanded = true; }}
		aria-label="Open AI tutor"
	>
		<span class="bubble-icon">
			{#if messages.length > 0}
				<span class="message-count">{messages.length}</span>
			{:else}
				<span class="chat-emoji">?</span>
			{/if}
		</span>
	</button>
{:else}
	<!-- Expanded: Full chat panel -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="chat-panel" onclick={(e) => e.stopPropagation()}>
		<header class="panel-header">
			<div class="header-left">
				<span class="header-icon">?</span>
				<span class="topic-context">{topic.title}</span>
			</div>
			<div class="header-actions">
				<button class="icon-btn" onclick={clearChat} title="Clear chat">
					<span>Clear</span>
				</button>
				<button
					class="close-btn"
					onclick={() => expanded = false}
					aria-label="Close chat"
				>
					<span>x</span>
				</button>
			</div>
		</header>

		{#if !lettaAvailable}
			<div class="no-api-key">
				<p>AI tutor is unavailable. The Letta server may not be running.</p>
				<p class="hint">Start the Letta server on localhost:8283</p>
			</div>
		{:else}
			<div class="messages" bind:this={messagesContainer}>
				{#if messages.length === 0}
					<div class="empty-state">
						<p>Ask questions about <strong>{topic.title}</strong></p>
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
					</div>
				{:else}
					{#each messages as message}
						<div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
							<div class="message-content">
								{@html formatMessage(message.content)}
							</div>
						</div>
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
					placeholder="Ask about {topic.title}..."
					disabled={loading}
				/>
				{#if loading}
					<button type="button" class="stop-btn" onclick={stopGeneration}>
						Stop
					</button>
				{:else}
					<button type="submit" disabled={!input.trim()}>
						>
					</button>
				{/if}
			</form>
		{/if}
	</div>
{/if}

<style>
	/* Bubble - collapsed state */
	.chat-bubble {
		position: fixed;
		bottom: var(--space-6);
		right: var(--space-6);
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent);
		border: none;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 100;
		transition: transform 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.chat-bubble:hover {
		transform: scale(1.1);
	}

	.bubble-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.chat-emoji {
		font-size: 24px;
	}

	.message-count {
		font-size: var(--text-sm);
		font-weight: 600;
		color: white;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 50%;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Panel - expanded state */
	.chat-panel {
		position: fixed;
		bottom: var(--space-6);
		right: var(--space-6);
		width: 400px;
		max-width: calc(100vw - var(--space-8));
		max-height: 500px;
		background: var(--bg-secondary);
		border: 1px solid var(--border-default);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		z-index: 100;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.header-icon {
		font-size: var(--text-lg);
	}

	.topic-context {
		font-weight: 500;
		color: var(--text-primary);
		font-size: var(--text-sm);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.icon-btn {
		background: transparent;
		color: var(--text-muted);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		border: none;
	}

	.icon-btn:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.close-btn {
		background: transparent;
		color: var(--text-muted);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-lg);
		line-height: 1;
		border: none;
	}

	.close-btn:hover {
		color: var(--text-primary);
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
		max-height: 350px;
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

	/* Mobile responsiveness */
	@media (max-width: 480px) {
		.chat-panel {
			width: calc(100vw - var(--space-4));
			right: var(--space-2);
			bottom: var(--space-2);
			max-height: 60vh;
		}
	}
</style>
