<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { topics, categories } from '$lib/data/topics';
	import { progressStore } from '$lib/stores/progress.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import FloatingChat from '$lib/components/FloatingChat.svelte';

	let { children } = $props();

	let sidebarOpen = $state(true);
	let settingsOpen = $state(false);

	// Detect current topic from URL for contextual chat
	const currentTopicId = $derived($page.url.pathname.match(/^\/topic\/(.+)$/)?.[1]);
	const currentTopic = $derived(currentTopicId ? topics.find(t => t.id === currentTopicId) : undefined);
	const currentPath = $derived($page.url.pathname);

	const topicsByCategory = $derived(
		categories.map(cat => ({
			...cat,
			topics: topics.filter(t => t.category === cat.id)
		}))
	);

	function getTopicProgress(topicId: string) {
		return progressStore.getTopicProgress(topicId);
	}

	function getTotalCompleted() {
		return progressStore.getCompletedCount(topics.map(t => t.id));
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Godot Engine Internals</title>
</svelte:head>

<div class="layout" class:sidebar-collapsed={!sidebarOpen}>
	<aside class="sidebar">
		<header class="sidebar-header">
			<div class="logo">
				<span class="logo-icon">🎮</span>
				<div class="logo-text">
					<h1>Godot Engine</h1>
					<span class="subtitle">Internals Deep Dive</span>
				</div>
			</div>
			<button
				class="toggle-btn"
				onclick={() => sidebarOpen = !sidebarOpen}
				aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
			>
				{sidebarOpen ? '◀' : '▶'}
			</button>
		</header>

		<div class="progress-summary">
			<div class="progress-bar">
				<div
					class="progress-fill"
					style="width: {(getTotalCompleted() / topics.length) * 100}%"
				></div>
			</div>
			<span class="progress-text">{getTotalCompleted()} / {topics.length} topics</span>
		</div>

		<nav class="nav">
			<a href="/" class="nav-item home" class:active={$page.url.pathname === '/'}>
				<span class="nav-icon">🏠</span>
				<span class="nav-label">Overview</span>
			</a>

			{#each topicsByCategory as category}
				<div class="nav-category">
					<span class="category-icon">{category.icon}</span>
					<span class="category-title">{category.title}</span>
				</div>
				{#each category.topics as topic}
					{@const progress = getTopicProgress(topic.id)}
					<a
						href="/topic/{topic.id}"
						class="nav-item"
						class:active={$page.url.pathname === `/topic/${topic.id}`}
						class:completed={progress.completed}
					>
						<span class="status-dot" class:done={progress.completed}></span>
						<span class="nav-label">{topic.title}</span>
					</a>
				{/each}
			{/each}
		</nav>

		<footer class="sidebar-footer">
			<a href="/resources" class="nav-item" class:active={$page.url.pathname === '/resources'}>
				<span class="nav-icon">📚</span>
				<span class="nav-label">All Resources</span>
			</a>
			<button class="nav-item settings-btn" onclick={() => settingsOpen = true}>
				<span class="nav-icon">⚙️</span>
				<span class="nav-label">Settings</span>
			</button>
		</footer>
	</aside>

	<main class="main">
		{@render children()}
	</main>
</div>

<!-- Floating Chat - Always accessible -->
<FloatingChat topic={currentTopic} {currentPath} />

<SettingsModal bind:open={settingsOpen} />

<style>
	.layout {
		display: grid;
		grid-template-columns: 280px 1fr;
		min-height: 100vh;
		transition: grid-template-columns var(--transition-base);
	}

	.layout.sidebar-collapsed {
		grid-template-columns: 60px 1fr;
	}

	.sidebar {
		background: var(--bg-secondary);
		border-right: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		height: 100vh;
		position: sticky;
		top: 0;
		overflow: hidden;
	}

	.sidebar-header {
		padding: var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		overflow: hidden;
	}

	.logo-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.logo-text {
		overflow: hidden;
	}

	.sidebar-collapsed .logo-text {
		display: none;
	}

	.logo h1 {
		font-size: var(--text-base);
		font-weight: 600;
		white-space: nowrap;
	}

	.subtitle {
		font-size: var(--text-xs);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.toggle-btn {
		background: var(--bg-elevated);
		color: var(--text-secondary);
		padding: var(--space-2);
		font-size: var(--text-xs);
		flex-shrink: 0;
	}

	.toggle-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.progress-summary {
		padding: var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}

	.sidebar-collapsed .progress-summary {
		padding: var(--space-2);
	}

	.progress-bar {
		height: 4px;
		background: var(--bg-elevated);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--success);
		transition: width var(--transition-base);
	}

	.progress-text {
		display: block;
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-muted);
		text-align: center;
	}

	.sidebar-collapsed .progress-text {
		display: none;
	}

	.nav {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-3);
	}

	.nav-category {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-2);
		margin-top: var(--space-4);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.nav-category:first-child {
		margin-top: 0;
	}

	.category-icon {
		flex-shrink: 0;
	}

	.sidebar-collapsed .category-title {
		display: none;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		transition: all var(--transition-fast);
		text-decoration: none;
	}

	.nav-item:hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}

	.nav-item.active {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.nav-item.home {
		margin-bottom: var(--space-2);
	}

	.nav-icon {
		flex-shrink: 0;
	}

	.sidebar-collapsed .nav-label {
		display: none;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		flex-shrink: 0;
	}

	.status-dot.done {
		background: var(--success);
		border-color: var(--success);
	}

	.sidebar-footer {
		padding: var(--space-3);
		border-top: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.settings-btn {
		border: none;
		cursor: pointer;
		background: transparent;
	}

	.main {
		min-height: 100vh;
		overflow-y: auto;
	}
</style>
