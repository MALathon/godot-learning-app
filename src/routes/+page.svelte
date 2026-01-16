<script lang="ts">
	import { topics, categories } from '$lib/data/topics';
	import { progressStore } from '$lib/stores/progress.svelte';

	const topicsByCategory = categories.map(cat => ({
		...cat,
		topics: topics.filter(t => t.category === cat.id)
	}));

	function getCompletedInCategory(categoryTopics: typeof topics) {
		return progressStore.getCompletedCount(categoryTopics.map(t => t.id));
	}
</script>

<div class="page">
	<header class="hero">
		<h1>Learn Game Engine Internals</h1>
		<p class="subtitle">
			Understanding how engines work by studying Godot's architecture.
			Not just how to use it—how it's built.
		</p>
	</header>

	<section class="intro">
		<div class="intro-card">
			<h3>Why Learn Internals?</h3>
			<p>
				Understanding the "why" behind engine design makes you a better developer.
				When you know how scenes, signals, and servers work under the hood,
				you make smarter architectural decisions.
			</p>
		</div>
		<div class="intro-card">
			<h3>Learning Approach</h3>
			<p>
				Each topic includes code examples, links to Godot source code,
				and exercises to apply concepts. Progress is saved locally—pick up
				where you left off.
			</p>
		</div>
	</section>

	<section class="topics-overview">
		<h2>Topics</h2>

		<div class="categories">
			{#each topicsByCategory as category}
				<div class="category-card">
					<header class="category-header">
						<span class="category-icon">{category.icon}</span>
						<div>
							<h3>{category.title}</h3>
							<span class="category-progress">
								{getCompletedInCategory(category.topics)} / {category.topics.length} completed
							</span>
						</div>
					</header>
					<ul class="topic-list">
						{#each category.topics as topic}
							{@const progress = progressStore.getTopicProgress(topic.id)}
							<li>
								<a href="/topic/{topic.id}" class="topic-link">
									<span class="topic-status" class:completed={progress.completed}>
										{progress.completed ? '✓' : '○'}
									</span>
									<div class="topic-info">
										<span class="topic-title">{topic.title}</span>
										<span class="topic-desc">{topic.description.slice(0, 80)}...</span>
									</div>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>

	<section class="quick-start">
		<h2>Recommended Path</h2>
		<ol class="path-list">
			<li>
				<a href="/topic/game-loop">The Game Loop</a>
				<span class="path-note">Start here—the heart of every game engine</span>
			</li>
			<li>
				<a href="/topic/scene-tree">Scene Trees</a>
				<span class="path-note">How Godot organizes game objects</span>
			</li>
			<li>
				<a href="/topic/signals">Signals (Observer Pattern)</a>
				<span class="path-note">Decoupled communication</span>
			</li>
			<li>
				<a href="/topic/composition">Composition Over Inheritance</a>
				<span class="path-note">Building with components</span>
			</li>
		</ol>
	</section>
</div>

<style>
	.page {
		padding: var(--space-8);
		max-width: 1200px;
		margin: 0 auto;
	}

	.hero {
		text-align: center;
		padding: var(--space-12) 0;
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-8);
	}

	.hero h1 {
		font-size: var(--text-3xl);
		margin-bottom: var(--space-4);
	}

	.subtitle {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		max-width: 600px;
		margin: 0 auto;
	}

	.intro {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--space-6);
		margin-bottom: var(--space-12);
	}

	.intro-card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.intro-card h3 {
		margin-bottom: var(--space-3);
		font-size: var(--text-lg);
	}

	.intro-card p {
		font-size: var(--text-sm);
		line-height: 1.7;
	}

	.topics-overview h2 {
		margin-bottom: var(--space-6);
	}

	.categories {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--space-6);
		margin-bottom: var(--space-12);
	}

	.category-card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.category-header {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}

	.category-icon {
		font-size: 1.5rem;
	}

	.category-header h3 {
		font-size: var(--text-base);
		margin-bottom: var(--space-1);
	}

	.category-progress {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.topic-list {
		list-style: none;
		padding: var(--space-3);
	}

	.topic-link {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: background var(--transition-fast);
	}

	.topic-link:hover {
		background: var(--bg-elevated);
	}

	.topic-status {
		color: var(--text-muted);
		font-size: var(--text-sm);
		width: 20px;
		text-align: center;
		flex-shrink: 0;
		padding-top: 2px;
	}

	.topic-status.completed {
		color: var(--success);
	}

	.topic-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.topic-title {
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.topic-desc {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.quick-start {
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.quick-start h2 {
		margin-bottom: var(--space-5);
	}

	.path-list {
		list-style: none;
		counter-reset: path;
	}

	.path-list li {
		counter-increment: path;
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--border-subtle);
	}

	.path-list li:last-child {
		border-bottom: none;
	}

	.path-list li::before {
		content: counter(path);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: var(--accent-muted);
		color: var(--accent);
		border-radius: 50%;
		font-size: var(--text-sm);
		font-weight: 600;
		flex-shrink: 0;
	}

	.path-list a {
		font-weight: 500;
	}

	.path-note {
		color: var(--text-muted);
		font-size: var(--text-sm);
		margin-left: auto;
	}
</style>
