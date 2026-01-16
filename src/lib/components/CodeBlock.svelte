<script lang="ts">
	import type { CodeExample } from '$lib/data/topics';

	let { example }: { example: CodeExample } = $props();

	let copied = $state(false);

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(example.code);
			copied = true;
			setTimeout(() => copied = false, 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}

	const languageLabels: Record<string, string> = {
		gdscript: 'GDScript',
		typescript: 'TypeScript',
		python: 'Python',
		cpp: 'C++'
	};
</script>

<div class="code-block">
	<header class="code-header">
		<span class="code-title">{example.title}</span>
		<div class="code-actions">
			<span class="language-badge">{languageLabels[example.language] || example.language}</span>
			<button class="copy-btn" onclick={copyCode}>
				{copied ? '✓ Copied' : 'Copy'}
			</button>
		</div>
	</header>
	<pre class="code-content"><code>{example.code}</code></pre>
	<footer class="code-explanation">
		<p>{example.explanation}</p>
	</footer>
</div>

<style>
	.code-block {
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		overflow: hidden;
		margin-bottom: var(--space-6);
	}

	.code-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border-subtle);
	}

	.code-title {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-primary);
	}

	.code-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.language-badge {
		font-size: var(--text-xs);
		color: var(--text-muted);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-secondary);
		border-radius: var(--radius-sm);
	}

	.copy-btn {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-3);
		background: transparent;
		color: var(--text-secondary);
		border: 1px solid var(--border-default);
	}

	.copy-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.code-content {
		margin: 0;
		padding: var(--space-4);
		border-radius: 0;
		border: none;
		background: #0d1117;
		overflow-x: auto;
	}

	.code-content code {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: #e6edf3;
	}

	.code-explanation {
		padding: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}

	.code-explanation p {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
		line-height: 1.6;
	}
</style>
