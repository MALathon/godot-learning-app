<script lang="ts">
	import { onDestroy } from 'svelte';
	import ChatSection from './ChatSection.svelte';
	import NotesSection from './NotesSection.svelte';
	import type { Topic } from '$lib/data/topics';
	import type { TopicProgress } from '$lib/server/storage';

	interface Props {
		topic?: Topic;
		progress?: TopicProgress;
		notes?: string;
		currentPath: string;
		collapsed?: boolean;
		onToggle?: () => void;
	}

	let {
		topic,
		progress,
		notes = '',
		currentPath,
		collapsed = false,
		onToggle
	}: Props = $props();

	// Resizable panel state
	let chatHeight = $state(60); // Percentage of panel height for chat
	let isDragging = $state(false);
	let panelRef: HTMLElement | null = $state(null);

	function handleDragStart(e: MouseEvent) {
		e.preventDefault();
		isDragging = true;
		document.addEventListener('mousemove', handleDrag);
		document.addEventListener('mouseup', handleDragEnd);
	}

	function handleDrag(e: MouseEvent) {
		if (!isDragging || !panelRef) return;

		const rect = panelRef.getBoundingClientRect();
		const contentTop = rect.top + 48; // Account for header if any
		const contentHeight = rect.height - 48;
		const relativeY = e.clientY - contentTop;
		const percentage = (relativeY / contentHeight) * 100;

		// Constrain between 20% and 80%
		chatHeight = Math.min(80, Math.max(20, percentage));
	}

	function handleDragEnd() {
		isDragging = false;
		document.removeEventListener('mousemove', handleDrag);
		document.removeEventListener('mouseup', handleDragEnd);
	}

	// Cleanup event listeners if component unmounts during drag
	onDestroy(() => {
		if (isDragging) {
			document.removeEventListener('mousemove', handleDrag);
			document.removeEventListener('mouseup', handleDragEnd);
		}
	});
</script>

<aside class="learning-panel" class:collapsed bind:this={panelRef}>
	{#if collapsed}
		<button class="expand-btn" onclick={onToggle} aria-label="Expand learning panel">
			<span class="expand-icon">&lt;</span>
			<span class="expand-label">Learning</span>
		</button>
	{:else}
		<div class="panel-content">
			<div class="chat-container" style="height: {chatHeight}%">
				<ChatSection {topic} {progress} {notes} />
			</div>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="resize-handle"
				class:dragging={isDragging}
				onmousedown={handleDragStart}
			>
				<div class="handle-bar"></div>
			</div>

			<div class="notes-container" style="height: {100 - chatHeight}%">
				<NotesSection {currentPath} />
			</div>
		</div>

		<button
			class="collapse-btn"
			onclick={onToggle}
			aria-label="Collapse learning panel"
			title="Collapse panel"
		>
			&gt;
		</button>
	{/if}
</aside>

<style>
	.learning-panel {
		height: 100vh;
		background: var(--bg-secondary);
		border-left: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		position: relative;
		transition: width var(--transition-base);
	}

	.learning-panel.collapsed {
		width: 48px !important;
		min-width: 48px !important;
	}

	.panel-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.chat-container {
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.notes-container {
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.resize-handle {
		flex-shrink: 0;
		height: 8px;
		background: var(--bg-primary);
		cursor: ns-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		border-top: 1px solid var(--border-subtle);
		border-bottom: 1px solid var(--border-subtle);
		transition: background var(--transition-fast);
	}

	.resize-handle:hover,
	.resize-handle.dragging {
		background: var(--bg-elevated);
	}

	.handle-bar {
		width: 40px;
		height: 3px;
		background: var(--border-default);
		border-radius: 2px;
	}

	.resize-handle:hover .handle-bar,
	.resize-handle.dragging .handle-bar {
		background: var(--accent);
	}

	.collapse-btn {
		position: absolute;
		left: -12px;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 48px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: 4px 0 0 4px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 10;
	}

	.collapse-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--accent);
	}

	.expand-btn {
		width: 100%;
		height: 100%;
		background: transparent;
		border: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		cursor: pointer;
		color: var(--text-muted);
	}

	.expand-btn:hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}

	.expand-icon {
		font-size: var(--text-lg);
	}

	.expand-label {
		writing-mode: vertical-rl;
		text-orientation: mixed;
		font-size: var(--text-xs);
		font-weight: 500;
	}

	/* Prevent text selection while dragging */
	.learning-panel:has(.resize-handle.dragging) {
		user-select: none;
	}
</style>
