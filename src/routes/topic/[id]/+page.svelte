<script lang="ts">
	import { onMount } from 'svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { progressStore } from '$lib/stores/progress.svelte';
	import type { PageData } from './$types';
	import type { TopicProgress } from '$lib/server/storage';

	import type { CodeExample, Resource } from '$lib/data/topics';

	// Extended type to include server data that may not be in auto-generated types
	type ExtendedPageData = PageData & {
		extension?: { resources?: Resource[]; codeExamples?: CodeExample[] };
		serverProgress?: TopicProgress;
	};

	let { data }: { data: ExtendedPageData } = $props();

	const topic = $derived(data.topic);
	// extension comes from +page.server.ts
	const extension = $derived(data.extension);
	const progress = $derived(progressStore.getTopicProgress(topic.id));

	// Merge static and extended resources/examples
	const allResources = $derived([...topic.resources, ...(extension?.resources || [])]);
	const allCodeExamples = $derived([...topic.codeExamples, ...(extension?.codeExamples || [])]);

	let activeTab = $state<'content' | 'exercises'>('content');

	onMount(() => {
		progressStore.markTopicVisited(topic.id);
	});

	function handleToggleComplete() {
		progressStore.markTopicCompleted(topic.id, !progress.completed);
	}

	function handleToggleExercise(index: number) {
		progressStore.toggleExercise(topic.id, index, topic.exercises.length);
	}

	function getExerciseStatus(index: number): boolean {
		return progress.exercisesCompleted[index] ?? false;
	}

	const resourceIcons: Record<string, string> = {
		docs: '📄',
		source: '💻',
		book: '📖',
		video: '🎬'
	};
</script>

<svelte:head>
	<title>{topic.title} - Godot Internals</title>
</svelte:head>

<div class="topic-page">
	<header class="topic-header">
		<div class="header-top">
			<span class="category-badge">{topic.category}</span>
			<button
				class="complete-btn"
				class:completed={progress.completed}
				onclick={handleToggleComplete}
			>
				{progress.completed ? '✓ Completed' : 'Mark Complete'}
			</button>
		</div>
		<h1>{topic.title}</h1>
		<p class="description">{topic.description}</p>
	</header>

	<nav class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'content'}
			onclick={() => activeTab = 'content'}
		>
			Content
		</button>
		<button
			class="tab"
			class:active={activeTab === 'exercises'}
			onclick={() => activeTab = 'exercises'}
		>
			Exercises
			<span class="exercise-count">
				{progress.exercisesCompleted.filter(Boolean).length}/{topic.exercises.length}
			</span>
		</button>
	</nav>

	{#if activeTab === 'content'}
		<div class="content">
			<section class="key-points">
				<h2>Key Concepts</h2>
				<ul>
					{#each topic.keyPoints as point}
						<li>{point}</li>
					{/each}
				</ul>
			</section>

			<section class="code-examples">
				<h2>Code Examples</h2>
				{#each allCodeExamples as example}
					<CodeBlock {example} />
				{/each}
			</section>

			<section class="godot-connection">
				<h2>Connection to Your Code</h2>
				<div class="connection-card">
					<p>{topic.godotConnection}</p>
				</div>
			</section>

			<section class="resources">
				<h2>Resources</h2>
				<ul class="resource-list">
					{#each allResources as resource}
						<li>
							<a href={resource.url} target="_blank" rel="noopener noreferrer">
								<span class="resource-icon">{resourceIcons[resource.type]}</span>
								<span class="resource-title">{resource.title}</span>
								<span class="resource-type">{resource.type}</span>
								{#if 'addedBy' in resource && resource.addedBy === 'ai'}
									<span class="ai-added">AI</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	{:else if activeTab === 'exercises'}
		<div class="exercises">
			<p class="exercises-intro">
				Practice applying these concepts. Check off exercises as you complete them.
			</p>
			<ul class="exercise-list">
				{#each topic.exercises as exercise, index}
					<li>
						<label class="exercise-item">
							<input
								type="checkbox"
								checked={getExerciseStatus(index)}
								onchange={() => handleToggleExercise(index)}
							/>
							<span class="exercise-text">{exercise}</span>
						</label>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<nav class="topic-nav">
		{#if data.prevTopic}
			<a href="/topic/{data.prevTopic.id}" class="nav-link prev">
				<span class="nav-direction">← Previous</span>
				<span class="nav-title">{data.prevTopic.title}</span>
			</a>
		{:else}
			<div></div>
		{/if}
		{#if data.nextTopic}
			<a href="/topic/{data.nextTopic.id}" class="nav-link next">
				<span class="nav-direction">Next →</span>
				<span class="nav-title">{data.nextTopic.title}</span>
			</a>
		{/if}
	</nav>

</div>

<style>
	.topic-page {
		padding: var(--space-8);
		max-width: 900px;
		margin: 0 auto;
	}

	.topic-header {
		margin-bottom: var(--space-8);
	}

	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.category-badge {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--accent);
		background: var(--accent-muted);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
	}

	.complete-btn {
		padding: var(--space-2) var(--space-4);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		border: 1px solid var(--border-default);
	}

	.complete-btn:hover {
		background: var(--bg-hover);
	}

	.complete-btn.completed {
		background: var(--success-muted);
		color: var(--success);
		border-color: var(--success);
	}

	.topic-header h1 {
		font-size: var(--text-3xl);
		margin-bottom: var(--space-4);
	}

	.description {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		line-height: 1.7;
	}

	.tabs {
		display: flex;
		gap: var(--space-2);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-8);
	}

	.tab {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: transparent;
		color: var(--text-secondary);
		border-radius: var(--radius-md) var(--radius-md) 0 0;
		position: relative;
	}

	.tab:hover {
		color: var(--text-primary);
	}

	.tab.active {
		color: var(--accent);
		background: var(--bg-secondary);
	}

	.tab.active::after {
		content: '';
		position: absolute;
		bottom: -1px;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--accent);
	}

	.exercise-count {
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: var(--bg-elevated);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	.content section {
		margin-bottom: var(--space-10);
	}

	.content h2 {
		font-size: var(--text-xl);
		margin-bottom: var(--space-5);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--border-subtle);
	}

	.key-points ul {
		list-style: none;
	}

	.key-points li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--border-subtle);
	}

	.key-points li:last-child {
		border-bottom: none;
	}

	.key-points li::before {
		content: '•';
		color: var(--accent);
		font-weight: bold;
		flex-shrink: 0;
	}

	.connection-card {
		background: var(--warning-muted);
		border: 1px solid rgba(255, 159, 10, 0.3);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
	}

	.connection-card p {
		color: var(--text-primary);
		margin: 0;
		line-height: 1.7;
	}

	.resource-list {
		list-style: none;
	}

	.resource-list li {
		margin-bottom: var(--space-2);
	}

	.resource-list a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: all var(--transition-fast);
	}

	.resource-list a:hover {
		background: var(--bg-elevated);
		border-color: var(--border-default);
	}

	.resource-icon {
		font-size: var(--text-lg);
	}

	.resource-title {
		flex: 1;
		color: var(--text-primary);
	}

	.resource-type {
		font-size: var(--text-xs);
		color: var(--text-muted);
		text-transform: uppercase;
	}

	.ai-added {
		font-size: var(--text-xs);
		color: var(--accent);
		background: var(--accent-muted);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		margin-left: var(--space-2);
	}

	.exercises-intro {
		color: var(--text-secondary);
		margin-bottom: var(--space-6);
	}

	.exercise-list {
		list-style: none;
	}

	.exercise-item {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-3);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.exercise-item:hover {
		background: var(--bg-elevated);
	}

	.exercise-item input[type="checkbox"] {
		margin-top: 2px;
	}

	.exercise-text {
		color: var(--text-primary);
		line-height: 1.6;
	}

	.topic-nav {
		display: flex;
		justify-content: space-between;
		margin-top: var(--space-12);
		padding-top: var(--space-8);
		border-top: 1px solid var(--border-subtle);
	}

	.nav-link {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-4);
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: all var(--transition-fast);
		max-width: 45%;
	}

	.nav-link:hover {
		background: var(--bg-elevated);
		border-color: var(--accent);
	}

	.nav-link.next {
		text-align: right;
		margin-left: auto;
	}

	.nav-direction {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.nav-title {
		font-weight: 500;
		color: var(--text-primary);
	}
</style>
