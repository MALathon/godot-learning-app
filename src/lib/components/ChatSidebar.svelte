<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Topic } from '$lib/data/topics';

	let { topic, open = $bindable(false) }: { topic: Topic; open: boolean } = $props();

	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
		timestamp: string;
	}

	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hasApiKey = $state(false);
	let messagesContainer: HTMLElement | null = $state(null);

	onMount(async () => {
		await checkApiKey();
		await loadNotebook();
	});

	// Reload notebook when topic changes
	$effect(() => {
		if (topic.id) {
			loadNotebook();
		}
	});

	async function checkApiKey() {
		try {
			const response = await fetch('/api/settings');
			if (response.ok) {
				const data = await response.json();
				hasApiKey = data.hasApiKey;
			}
		} catch (e) {
			console.error('Failed to check API key:', e);
		}
	}

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

	async function sendMessage() {
		if (!input.trim() || loading) return;

		const userMessage = input.trim();
		input = '';
		loading = true;
		error = null;

		// Optimistically add user message
		messages = [...messages, {
			role: 'user',
			content: userMessage,
			timestamp: new Date().toISOString()
		}];
		await scrollToBottom();

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topicId: topic.id,
					message: userMessage,
					topicContext: {
						title: topic.title,
						category: topic.category,
						description: topic.description,
						keyPoints: topic.keyPoints,
						godotConnection: topic.godotConnection,
						exercises: topic.exercises,
						codeExamples: topic.codeExamples.map(e => ({
							title: e.title,
							language: e.language
						}))
					}
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to get response');
			}

			const data = await response.json();
			messages = data.notebook.messages;
			await scrollToBottom();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
			// Remove the optimistic message on error
			messages = messages.slice(0, -1);
		} finally {
			loading = false;
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

	function formatMessage(content: string): string {
		// Basic markdown-like formatting
		return content
			.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\n/g, '<br>');
	}
</script>

{#if open}
	<aside class="chat-sidebar">
		<header class="chat-header">
			<div class="header-title">
				<span class="chat-icon">💬</span>
				<h3>AI Tutor</h3>
			</div>
			<div class="header-actions">
				<button class="icon-btn" onclick={clearChat} title="Clear chat">
					🗑️
				</button>
				<button class="icon-btn" onclick={() => open = false} title="Close">
					×
				</button>
			</div>
		</header>

		<div class="chat-context">
			<span class="context-label">Topic:</span>
			<span class="context-value">{topic.title}</span>
		</div>

		{#if !hasApiKey}
			<div class="no-api-key">
				<p>Configure your Anthropic API key in Settings to use the AI tutor.</p>
				<p class="hint">Click the ⚙️ icon in the header.</p>
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
							<button onclick={() => { input = "How does this relate to my tic-tac-toe game?"; sendMessage(); }}>
								Connect to my code
							</button>
							<button class="research-btn" onclick={() => { input = "Find and add some great learning resources for this topic - official docs, tutorials, videos, or source code. Save them to my study materials."; sendMessage(); }}>
								+ Add resources
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

			<form class="chat-input" onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
				<textarea
					bind:value={input}
					onkeydown={handleKeydown}
					placeholder="Ask about {topic.title}..."
					rows="2"
					disabled={loading}
				></textarea>
				<button type="submit" disabled={loading || !input.trim()}>
					{loading ? '...' : '→'}
				</button>
			</form>
		{/if}
	</aside>
{/if}

<style>
	.chat-sidebar {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 400px;
		max-width: 100vw;
		background: var(--bg-secondary);
		border-left: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		z-index: 100;
		box-shadow: var(--shadow-lg);
	}

	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.chat-icon {
		font-size: var(--text-lg);
	}

	.chat-header h3 {
		font-size: var(--text-base);
		margin: 0;
	}

	.header-actions {
		display: flex;
		gap: var(--space-1);
	}

	.icon-btn {
		background: transparent;
		color: var(--text-muted);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-lg);
	}

	.icon-btn:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.chat-context {
		padding: var(--space-3) var(--space-4);
		background: var(--accent-muted);
		font-size: var(--text-sm);
		display: flex;
		gap: var(--space-2);
	}

	.context-label {
		color: var(--text-muted);
	}

	.context-value {
		color: var(--accent);
		font-weight: 500;
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
	}

	.no-api-key .hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.empty-state {
		text-align: center;
		padding: var(--space-8) var(--space-4);
	}

	.empty-state p {
		color: var(--text-secondary);
		margin-bottom: var(--space-4);
	}

	.suggestions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.suggestions button {
		background: var(--bg-elevated);
		color: var(--text-secondary);
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		font-size: var(--text-sm);
		text-align: left;
	}

	.suggestions button:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--accent);
	}

	.suggestions .research-btn {
		background: var(--accent-muted);
		color: var(--accent);
		border-color: var(--accent);
	}

	.suggestions .research-btn:hover {
		background: var(--accent);
		color: white;
	}

	.message {
		max-width: 90%;
	}

	.message.user {
		align-self: flex-end;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-content {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		line-height: 1.6;
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
		padding: var(--space-3);
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
		padding: var(--space-3) var(--space-4);
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
		padding: var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		text-align: center;
	}

	.chat-input {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}

	.chat-input textarea {
		flex: 1;
		resize: none;
		min-height: unset;
		padding: var(--space-3);
		font-size: var(--text-sm);
	}

	.chat-input button {
		padding: var(--space-3) var(--space-4);
		background: var(--accent);
		color: white;
		font-weight: 600;
	}

	.chat-input button:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.chat-input button:disabled {
		opacity: 0.5;
	}
</style>
