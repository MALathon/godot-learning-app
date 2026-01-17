<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		currentPath: string; // Current URL path for ambient "writtenFrom" metadata
	}

	let { currentPath }: Props = $props();

	interface JournalEntry {
		id: string;
		content: string;
		timestamp: string;
		writtenFrom: string;
	}

	let entries = $state<JournalEntry[]>([]);
	let newNote = $state('');
	let loading = $state(false);
	let editingId = $state<string | null>(null);
	let editContent = $state('');

	onMount(async () => {
		await loadJournal();
	});

	async function loadJournal() {
		try {
			const response = await fetch('/api/journal');
			if (response.ok) {
				const data = await response.json();
				entries = data.entries || [];
			}
		} catch (e) {
			console.error('Failed to load journal:', e);
		}
	}

	async function addNote() {
		if (!newNote.trim() || loading) return;

		loading = true;
		try {
			const response = await fetch('/api/journal', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: newNote.trim(),
					writtenFrom: currentPath
				})
			});

			if (response.ok) {
				const entry = await response.json();
				entries = [entry, ...entries];
				newNote = '';
			}
		} catch (e) {
			console.error('Failed to add note:', e);
		} finally {
			loading = false;
		}
	}

	async function updateNote(id: string) {
		if (!editContent.trim()) return;

		try {
			const response = await fetch('/api/journal', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, content: editContent.trim() })
			});

			if (response.ok) {
				const updated = await response.json();
				entries = entries.map(e => e.id === id ? updated : e);
				editingId = null;
				editContent = '';
			}
		} catch (e) {
			console.error('Failed to update note:', e);
		}
	}

	async function deleteNote(id: string) {
		if (!confirm('Delete this note?')) return;

		try {
			const response = await fetch('/api/journal', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});

			if (response.ok) {
				entries = entries.filter(e => e.id !== id);
			}
		} catch (e) {
			console.error('Failed to delete note:', e);
		}
	}

	function startEdit(entry: JournalEntry) {
		editingId = entry.id;
		editContent = entry.content;
	}

	function cancelEdit() {
		editingId = null;
		editContent = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			addNote();
		}
	}

	function formatTimestamp(timestamp: string): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		// Within last hour
		const minutes = Math.floor(diff / 60000);
		if (minutes < 60) return `${minutes}m ago`;

		// Within last 24 hours
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;

		// Within last week
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;

		// Otherwise show date
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatLocation(path: string): string {
		// Extract friendly location from path
		if (path === '/' || path === '/home') return 'Home';
		if (path === '/resources') return 'Resources';
		if (path.startsWith('/topic/')) {
			const topicId = path.replace('/topic/', '');
			// Convert kebab-case to Title Case
			return topicId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
		}
		return path;
	}
</script>

<div class="notes-section">
	<header class="section-header">
		<span class="section-title">Notes</span>
		<span class="note-count">{entries.length}</span>
	</header>

	<form class="note-input" onsubmit={(e) => { e.preventDefault(); addNote(); }}>
		<textarea
			bind:value={newNote}
			onkeydown={handleKeydown}
			placeholder="Write a note... (Enter to save)"
			rows="2"
			disabled={loading}
		></textarea>
		<button type="submit" disabled={!newNote.trim() || loading}>
			+
		</button>
	</form>

	<div class="notes-list">
		{#if entries.length === 0}
			<div class="empty-state">
				<p>Your learning journal is empty</p>
				<p class="hint">Notes you write will appear here, tagged with where you wrote them</p>
			</div>
		{:else}
			{#each entries as entry (entry.id)}
				<div class="note-entry">
					{#if editingId === entry.id}
						<div class="edit-form">
							<textarea
								bind:value={editContent}
								rows="3"
							></textarea>
							<div class="edit-actions">
								<button class="save-btn" onclick={() => updateNote(entry.id)}>Save</button>
								<button class="cancel-btn" onclick={cancelEdit}>Cancel</button>
							</div>
						</div>
					{:else}
						<div class="note-content">{entry.content}</div>
						<div class="note-meta">
							<span class="note-location" title={entry.writtenFrom}>
								{formatLocation(entry.writtenFrom)}
							</span>
							<span class="note-time">{formatTimestamp(entry.timestamp)}</span>
							<div class="note-actions">
								<button class="edit-btn" onclick={() => startEdit(entry)} title="Edit">
									E
								</button>
								<button class="delete-btn" onclick={() => deleteNote(entry.id)} title="Delete">
									X
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.notes-section {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-secondary);
		overflow: hidden;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
		flex-shrink: 0;
	}

	.section-title {
		font-weight: 600;
		color: var(--text-primary);
		font-size: var(--text-sm);
	}

	.note-count {
		font-size: var(--text-xs);
		color: var(--text-muted);
		background: var(--bg-primary);
		padding: 2px 8px;
		border-radius: var(--radius-full);
	}

	.note-input {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-3);
		border-bottom: 1px solid var(--border-subtle);
		background: var(--bg-primary);
		flex-shrink: 0;
	}

	.note-input textarea {
		flex: 1;
		background: var(--bg-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-2);
		color: var(--text-primary);
		font-size: var(--text-sm);
		resize: none;
		font-family: inherit;
	}

	.note-input textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.note-input textarea::placeholder {
		color: var(--text-muted);
	}

	.note-input button {
		padding: var(--space-2) var(--space-3);
		background: var(--accent);
		color: white;
		font-weight: 600;
		border-radius: var(--radius-md);
		align-self: flex-end;
	}

	.note-input button:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.note-input button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.notes-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-3);
	}

	.empty-state {
		text-align: center;
		padding: var(--space-6) var(--space-4);
	}

	.empty-state p {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		margin-bottom: var(--space-2);
	}

	.empty-state .hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.note-entry {
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.note-entry:hover {
		border-color: var(--border-default);
	}

	.note-content {
		font-size: var(--text-sm);
		color: var(--text-primary);
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.note-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--text-xs);
	}

	.note-location {
		color: var(--accent);
		font-weight: 500;
	}

	.note-time {
		color: var(--text-muted);
	}

	.note-actions {
		margin-left: auto;
		display: flex;
		gap: var(--space-1);
		opacity: 0;
		transition: opacity var(--transition-fast);
	}

	.note-entry:hover .note-actions {
		opacity: 1;
	}

	.edit-btn,
	.delete-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		padding: 2px 6px;
		font-size: var(--text-xs);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.edit-btn:hover {
		color: var(--accent);
		background: var(--accent-muted);
	}

	.delete-btn:hover {
		color: var(--error);
		background: var(--error-muted, rgba(255, 69, 58, 0.15));
	}

	.edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.edit-form textarea {
		width: 100%;
		background: var(--bg-primary);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		padding: var(--space-2);
		color: var(--text-primary);
		font-size: var(--text-sm);
		resize: none;
		font-family: inherit;
	}

	.edit-form textarea:focus {
		outline: none;
	}

	.edit-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}

	.save-btn,
	.cancel-btn {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		border-radius: var(--radius-sm);
	}

	.save-btn {
		background: var(--accent);
		color: white;
	}

	.save-btn:hover {
		background: var(--accent-hover);
	}

	.cancel-btn {
		background: var(--bg-hover);
		color: var(--text-secondary);
	}

	.cancel-btn:hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}
</style>
