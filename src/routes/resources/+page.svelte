<script lang="ts">
	import { topics } from '$lib/data/topics';

	const allResources = topics.flatMap(topic =>
		topic.resources.map(resource => ({
			...resource,
			topicId: topic.id,
			topicTitle: topic.title
		}))
	);

	const resourcesByType = {
		docs: allResources.filter(r => r.type === 'docs'),
		source: allResources.filter(r => r.type === 'source'),
		book: allResources.filter(r => r.type === 'book'),
		video: allResources.filter(r => r.type === 'video')
	};

	const typeLabels: Record<string, { title: string; icon: string; description: string }> = {
		docs: {
			title: 'Documentation',
			icon: '📄',
			description: 'Official docs and tutorials'
		},
		source: {
			title: 'Source Code',
			icon: '💻',
			description: 'Godot engine source on GitHub'
		},
		book: {
			title: 'Books & Articles',
			icon: '📖',
			description: 'In-depth reading material'
		},
		video: {
			title: 'Videos',
			icon: '🎬',
			description: 'Video tutorials and talks'
		}
	};
</script>

<svelte:head>
	<title>Resources - Godot Internals</title>
</svelte:head>

<div class="resources-page">
	<header class="page-header">
		<h1>All Resources</h1>
		<p>Curated links to documentation, source code, and learning materials.</p>
	</header>

	<div class="resource-sections">
		{#each Object.entries(resourcesByType) as [type, resources]}
			{#if resources.length > 0}
				<section class="resource-section">
					<header class="section-header">
						<span class="section-icon">{typeLabels[type].icon}</span>
						<div>
							<h2>{typeLabels[type].title}</h2>
							<p>{typeLabels[type].description}</p>
						</div>
						<span class="resource-count">{resources.length}</span>
					</header>
					<ul class="resource-list">
						{#each resources as resource}
							<li class="resource-item">
								<a href={resource.url} target="_blank" rel="noopener noreferrer" class="resource-link">
									<span class="resource-title">{resource.title}</span>
								</a>
								<span class="resource-topic">
									from <a href="/topic/{resource.topicId}">{resource.topicTitle}</a>
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	</div>

	<section class="additional-resources">
		<h2>Additional Learning</h2>
		<div class="resource-cards">
			<a href="https://gameprogrammingpatterns.com" target="_blank" rel="noopener noreferrer" class="resource-card">
				<span class="card-icon">📖</span>
				<div class="card-content">
					<h3>Game Programming Patterns</h3>
					<p>Free online book covering essential game architecture patterns</p>
				</div>
			</a>
			<a href="https://github.com/godotengine/godot" target="_blank" rel="noopener noreferrer" class="resource-card">
				<span class="card-icon">💻</span>
				<div class="card-content">
					<h3>Godot Engine Source</h3>
					<p>The complete Godot 4 source code on GitHub</p>
				</div>
			</a>
			<a href="https://docs.godotengine.org/en/stable/" target="_blank" rel="noopener noreferrer" class="resource-card">
				<span class="card-icon">📄</span>
				<div class="card-content">
					<h3>Official Godot Docs</h3>
					<p>Comprehensive documentation and tutorials</p>
				</div>
			</a>
			<a href="https://gafferongames.com" target="_blank" rel="noopener noreferrer" class="resource-card">
				<span class="card-icon">🎮</span>
				<div class="card-content">
					<h3>Gaffer On Games</h3>
					<p>Deep dives into networking, physics, and game loops</p>
				</div>
			</a>
		</div>
	</section>
</div>

<style>
	.resources-page {
		padding: var(--space-8);
		max-width: 1000px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--space-10);
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--border-subtle);
	}

	.page-header h1 {
		font-size: var(--text-3xl);
		margin-bottom: var(--space-3);
	}

	.page-header p {
		font-size: var(--text-lg);
		color: var(--text-secondary);
	}

	.resource-sections {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		margin-bottom: var(--space-12);
	}

	.resource-section {
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border-subtle);
	}

	.section-icon {
		font-size: 1.5rem;
	}

	.section-header h2 {
		font-size: var(--text-lg);
		margin-bottom: var(--space-1);
	}

	.section-header p {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.resource-count {
		margin-left: auto;
		font-size: var(--text-sm);
		color: var(--text-muted);
		background: var(--bg-secondary);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
	}

	.resource-list {
		list-style: none;
	}

	.resource-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
	}

	.resource-item:last-child {
		border-bottom: none;
	}

	.resource-item:hover {
		background: var(--bg-elevated);
	}

	.resource-link {
		text-decoration: none;
	}

	.resource-title {
		color: var(--text-primary);
		font-weight: 500;
	}

	.resource-topic {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.resource-topic a {
		color: var(--accent);
	}

	.additional-resources {
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.additional-resources h2 {
		font-size: var(--text-xl);
		margin-bottom: var(--space-6);
	}

	.resource-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--space-4);
	}

	.resource-card {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: all var(--transition-fast);
	}

	.resource-card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
	}

	.card-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.card-content h3 {
		font-size: var(--text-base);
		color: var(--text-primary);
		margin-bottom: var(--space-2);
	}

	.card-content p {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
</style>
