<script lang="ts">
	import { onMount } from 'svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();

	let lettaStatus = $state<'checking' | 'connected' | 'disconnected'>('checking');
	let lettaUrl = $state('http://localhost:8283');
	let agentInfo = $state<{ gideon: boolean; curator: boolean }>({ gideon: false, curator: false });
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	onMount(async () => {
		await checkLettaStatus();
	});

	async function checkLettaStatus() {
		lettaStatus = 'checking';
		try {
			const response = await fetch('/api/letta/reset');
			if (response.ok) {
				const data = await response.json();
				lettaStatus = data.available ? 'connected' : 'disconnected';
				agentInfo = data.agents || { gideon: false, curator: false };
			} else {
				lettaStatus = 'disconnected';
			}
		} catch (e) {
			console.error('Failed to check Letta status:', e);
			lettaStatus = 'disconnected';
		}
	}

	async function resetAgentMemory() {
		message = null;
		try {
			const response = await fetch('/api/letta/reset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ agent: 'all', blocks: 'all' })
			});

			if (response.ok) {
				const data = await response.json();
				message = { type: 'success', text: `Reset ${data.results?.filter((r: {status: string}) => r.status === 'reset').length || 0} memory blocks` };
				setTimeout(() => message = null, 3000);
			} else {
				message = { type: 'error', text: 'Failed to reset memory' };
			}
		} catch (e) {
			message = { type: 'error', text: 'Failed to connect to Letta' };
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="modal-backdrop" onclick={() => open = false} onkeydown={(e) => e.key === 'Enter' && (open = false)} role="button" tabindex="0">
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<header class="modal-header">
				<h2>Settings</h2>
				<button class="close-btn" onclick={() => open = false}>×</button>
			</header>

			<div class="modal-body">
				<div class="field">
					<label>Letta AI Server</label>
					<div class="status-row">
						<span class="status-indicator" class:connected={lettaStatus === 'connected'} class:disconnected={lettaStatus === 'disconnected'} class:checking={lettaStatus === 'checking'}>
							{#if lettaStatus === 'checking'}
								⏳ Checking...
							{:else if lettaStatus === 'connected'}
								✓ Connected
							{:else}
								✗ Disconnected
							{/if}
						</span>
						<button class="btn-small" onclick={checkLettaStatus}>Refresh</button>
					</div>
					<p class="field-hint">
						Server URL: <code>{lettaUrl}</code>
					</p>
				</div>

				{#if lettaStatus === 'connected'}
					<div class="field">
						<label>AI Agents</label>
						<div class="agents-list">
							<div class="agent-item">
								<span class="agent-status" class:active={agentInfo.gideon}>
									{agentInfo.gideon ? '✓' : '✗'}
								</span>
								<span class="agent-name">Gideon</span>
								<span class="agent-role">Tutor Agent</span>
							</div>
							<div class="agent-item">
								<span class="agent-status" class:active={agentInfo.curator}>
									{agentInfo.curator ? '✓' : '✗'}
								</span>
								<span class="agent-name">Curator</span>
								<span class="agent-role">Content Agent</span>
							</div>
						</div>
					</div>

					<div class="field">
						<label>Memory Management</label>
						<button class="btn-danger" onclick={resetAgentMemory}>
							Reset Agent Memory
						</button>
						<p class="field-hint">
							This will reset all agent memory blocks to their default state.
						</p>
					</div>
				{:else if lettaStatus === 'disconnected'}
					<div class="field">
						<div class="setup-instructions">
							<p><strong>Letta server not running.</strong></p>
							<p>To start the AI tutor:</p>
							<ol>
								<li>Run <code>letta server</code> in a terminal</li>
								<li>Run <code>cd letta && python setup_agents.py</code></li>
								<li>Refresh this page</li>
							</ol>
						</div>
					</div>
				{/if}

				{#if message}
					<div class="message" class:success={message.type === 'success'} class:error={message.type === 'error'}>
						{message.text}
					</div>
				{/if}
			</div>

			<footer class="modal-footer">
				<button class="btn-secondary" onclick={() => open = false}>Close</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		width: 90%;
		max-width: 480px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
	}

	.modal-header h2 {
		font-size: var(--text-lg);
		margin: 0;
	}

	.close-btn {
		background: transparent;
		color: var(--text-muted);
		font-size: var(--text-xl);
		padding: var(--space-1) var(--space-2);
		line-height: 1;
	}

	.close-btn:hover {
		color: var(--text-primary);
	}

	.modal-body {
		padding: var(--space-5);
		overflow-y: auto;
	}

	.field {
		margin-bottom: var(--space-5);
	}

	.field:last-child {
		margin-bottom: 0;
	}

	.field label {
		display: block;
		font-size: var(--text-sm);
		font-weight: 500;
		margin-bottom: var(--space-2);
		color: var(--text-primary);
	}

	.status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3);
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
	}

	.status-indicator {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.status-indicator.connected {
		color: var(--success);
	}

	.status-indicator.disconnected {
		color: var(--error);
	}

	.status-indicator.checking {
		color: var(--text-muted);
	}

	.btn-small {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
	}

	.btn-small:hover {
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.agents-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.agent-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
	}

	.agent-status {
		font-size: var(--text-sm);
		color: var(--error);
	}

	.agent-status.active {
		color: var(--success);
	}

	.agent-name {
		font-weight: 500;
		color: var(--text-primary);
	}

	.agent-role {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin-left: auto;
	}

	.btn-danger {
		background: rgba(255, 69, 58, 0.15);
		color: var(--error);
		border: 1px solid var(--error);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.btn-danger:hover {
		background: rgba(255, 69, 58, 0.25);
	}

	.setup-instructions {
		padding: var(--space-4);
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.setup-instructions p {
		margin: 0 0 var(--space-2);
	}

	.setup-instructions ol {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-5);
	}

	.setup-instructions li {
		margin-bottom: var(--space-1);
	}

	.setup-instructions code {
		background: var(--bg-primary);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.field-hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin-top: var(--space-2);
	}

	.field-hint code {
		background: var(--bg-elevated);
		padding: 1px 4px;
		border-radius: 2px;
	}

	.message {
		padding: var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		text-align: center;
	}

	.message.success {
		background: var(--success-muted);
		color: var(--success);
	}

	.message.error {
		background: rgba(255, 69, 58, 0.15);
		color: var(--error);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}
</style>
