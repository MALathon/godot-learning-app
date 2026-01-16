<script lang="ts">
	import { onMount } from 'svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();

	interface ModelOption {
		id: string;
		name: string;
		createdAt: string;
	}

	let apiKey = $state('');
	let hasApiKey = $state(false);
	let apiKeyPreview = $state<string | null>(null);
	let model = $state('claude-sonnet-4-20250514');
	let saving = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let availableModels = $state<ModelOption[]>([]);
	let loadingModels = $state(false);

	// Fallback models if API call fails
	const fallbackModels: ModelOption[] = [
		{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', createdAt: '' },
		{ id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', createdAt: '' },
		{ id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', createdAt: '' }
	];

	onMount(async () => {
		await loadSettings();
	});

	async function loadModels() {
		if (!hasApiKey) {
			availableModels = fallbackModels;
			return;
		}

		loadingModels = true;
		try {
			const response = await fetch('/api/models');
			if (response.ok) {
				const data = await response.json();
				if (data.models && data.models.length > 0) {
					availableModels = data.models;
				} else {
					availableModels = fallbackModels;
				}
			} else {
				availableModels = fallbackModels;
			}
		} catch (e) {
			console.error('Failed to load models:', e);
			availableModels = fallbackModels;
		} finally {
			loadingModels = false;
		}
	}

	async function loadSettings() {
		try {
			const response = await fetch('/api/settings');
			if (response.ok) {
				const data = await response.json();
				hasApiKey = data.hasApiKey;
				apiKeyPreview = data.apiKeyPreview;
				model = data.model;
			}
		} catch (e) {
			console.error('Failed to load settings:', e);
		}
		await loadModels();
	}

	async function saveSettings() {
		saving = true;
		message = null;

		try {
			const body: Record<string, string> = { model };
			if (apiKey.trim()) {
				body.apiKey = apiKey.trim();
			}

			const response = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (response.ok) {
				const data = await response.json();
				hasApiKey = data.hasApiKey;
				apiKeyPreview = data.apiKeyPreview;
				apiKey = '';
				message = { type: 'success', text: 'Settings saved!' };
				// Reload models with new API key
				await loadModels();
				setTimeout(() => {
					message = null;
					open = false;
				}, 1500);
			} else {
				message = { type: 'error', text: 'Failed to save settings' };
			}
		} catch (e) {
			message = { type: 'error', text: 'Failed to save settings' };
		} finally {
			saving = false;
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
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => open = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<header class="modal-header">
				<h2>Settings</h2>
				<button class="close-btn" onclick={() => open = false}>×</button>
			</header>

			<div class="modal-body">
				<div class="field">
					<label for="apiKey">Anthropic API Key</label>
					{#if hasApiKey}
						<div class="current-key">
							<span class="key-preview">Current: {apiKeyPreview}</span>
							<span class="key-status">✓ Configured</span>
						</div>
					{/if}
					<input
						id="apiKey"
						type="password"
						bind:value={apiKey}
						placeholder={hasApiKey ? 'Enter new key to replace' : 'sk-ant-...'}
					/>
					<p class="field-hint">
						Your API key is stored locally on this server in the <code>data/</code> directory.
					</p>
				</div>

				<div class="field">
					<label for="model">Model</label>
					{#if loadingModels}
						<select id="model" disabled>
							<option>Loading models...</option>
						</select>
					{:else}
						<select id="model" bind:value={model}>
							{#each availableModels as modelOption}
								<option value={modelOption.id}>{modelOption.name}</option>
							{/each}
						</select>
					{/if}
					{#if !hasApiKey}
						<p class="field-hint">Add an API key to see all available models.</p>
					{/if}
				</div>

				{#if message}
					<div class="message" class:success={message.type === 'success'} class:error={message.type === 'error'}>
						{message.text}
					</div>
				{/if}
			</div>

			<footer class="modal-footer">
				<button class="btn-secondary" onclick={() => open = false}>Cancel</button>
				<button class="btn-primary" onclick={saveSettings} disabled={saving}>
					{saving ? 'Saving...' : 'Save Settings'}
				</button>
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

	.current-key {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-elevated);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-2);
		font-size: var(--text-sm);
	}

	.key-preview {
		color: var(--text-muted);
		font-family: var(--font-mono);
	}

	.key-status {
		color: var(--success);
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
