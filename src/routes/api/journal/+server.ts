import { json } from '@sveltejs/kit';
import { getJournal, addJournalEntry, updateJournalEntry, deleteJournalEntry } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// GET - retrieve all journal entries
export const GET: RequestHandler = async () => {
	const journal = getJournal();
	return json(journal);
};

// POST - add new entry
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch (parseError) {
		console.error('Failed to parse journal POST body:', parseError instanceof Error ? parseError.message : parseError);
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { content, writtenFrom } = body;

	if (!content || typeof content !== 'string' || !content.trim()) {
		return json({ error: 'content is required' }, { status: 400 });
	}

	if (!writtenFrom || typeof writtenFrom !== 'string') {
		return json({ error: 'writtenFrom is required' }, { status: 400 });
	}

	const entry = addJournalEntry(content.trim(), writtenFrom);
	return json(entry, { status: 201 });
};

// PATCH - update existing entry
export const PATCH: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch (parseError) {
		console.error('Failed to parse journal PATCH body:', parseError instanceof Error ? parseError.message : parseError);
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { id, content } = body;

	if (!id || typeof id !== 'string') {
		return json({ error: 'id is required' }, { status: 400 });
	}

	if (!content || typeof content !== 'string' || !content.trim()) {
		return json({ error: 'content is required' }, { status: 400 });
	}

	const entry = updateJournalEntry(id, content.trim());
	if (!entry) {
		return json({ error: 'Entry not found' }, { status: 404 });
	}

	return json(entry);
};

// DELETE - remove entry
export const DELETE: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch (parseError) {
		console.error('Failed to parse journal DELETE body:', parseError instanceof Error ? parseError.message : parseError);
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { id } = body;

	if (!id || typeof id !== 'string') {
		return json({ error: 'id is required' }, { status: 400 });
	}

	const deleted = deleteJournalEntry(id);
	if (!deleted) {
		return json({ error: 'Entry not found' }, { status: 404 });
	}

	return json({ success: true });
};
