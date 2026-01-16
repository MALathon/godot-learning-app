import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getNotebook, addMessageToNotebook, logAgentActivity } from '$lib/server/storage';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LETTA_URL = env.LETTA_URL ?? 'http://localhost:8283';
const INTERNAL_URL = env.INTERNAL_URL ?? 'http://localhost:5999';

// Trigger background curation after a conversation
async function triggerPostConversationCuration(topicId: string) {
	try {
		// Fire and forget - runs in background after conversation
		fetch(`${INTERNAL_URL}/api/letta/curate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				mode: 'topic',
				topicId,
				background: true,
				trigger: 'post_conversation'
			})
		}).catch(() => {
			// Silently ignore - background task
		});
	} catch {
		// Ignore errors for background tasks
	}
}

// Load agent IDs from the letta folder
function getAgentIds(): { gideon?: string; curator?: string } {
	const agentIdsPath = join(process.cwd(), 'letta', 'agent_ids.json');
	const legacyPath = join(process.cwd(), 'letta', 'agent_id.txt');

	if (existsSync(agentIdsPath)) {
		try {
			const data = readFileSync(agentIdsPath, 'utf-8');
			return JSON.parse(data);
		} catch {
			// Fall through to legacy
		}
	}

	if (existsSync(legacyPath)) {
		try {
			const gideonId = readFileSync(legacyPath, 'utf-8').trim();
			return { gideon: gideonId };
		} catch {
			// No agents available
		}
	}

	return {};
}

function getGideonAgentId(): string | null {
	const ids = getAgentIds();
	return ids.gideon || null;
}

export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { topicId, message, topicContext, stream = false } = body;

	// Input validation
	if (!topicId || typeof topicId !== 'string') {
		return json({ error: 'topicId is required' }, { status: 400 });
	}
	if (!message || typeof message !== 'string') {
		return json({ error: 'message is required' }, { status: 400 });
	}
	if (!topicContext?.title || !topicContext?.category) {
		return json({ error: 'topicContext with title and category is required' }, { status: 400 });
	}

	// Save user message to notebook (local history)
	addMessageToNotebook(topicId, {
		role: 'user',
		content: message,
		timestamp: new Date().toISOString()
	});

	// Get the agent ID
	const agentId = getGideonAgentId();
	if (!agentId) {
		return json({
			error: 'AI tutor not available. Run setup_agents.py first.',
			hint: 'cd letta && python setup_agents.py'
		}, { status: 503 });
	}

	// Build richer context-aware message for Letta
	const notesSection = topicContext.notes ? `\n\nUser's notes: ${topicContext.notes}` : '';
	const contextMessage = `[Context: User is studying "${topicContext.title}" (${topicContext.category})]
[Key concepts: ${topicContext.keyPoints?.slice(0, 3).join(', ') || 'N/A'}]
[Godot connection: ${topicContext.godotConnection || 'N/A'}]${notesSection}

${message}`;

	if (stream) {
		return handleStreamingResponse(topicId, contextMessage, agentId);
	}

	return handleNonStreamingResponse(topicId, contextMessage, agentId);
};

/**
 * Parse JSON string with escape sequences properly.
 * Handles \" \n \t \\ etc.
 */
/**
 * Map tool name to activity type for logging.
 */
function mapToolNameToActivity(toolName: string): 'search' | 'add_resource' | 'add_code_example' | 'add_lesson' | 'thinking' | null {
	switch (toolName) {
		case 'web_search':
			return 'search';
		case 'add_resource':
			return 'add_resource';
		case 'add_code_example':
			return 'add_code_example';
		case 'add_lesson':
			return 'add_lesson';
		case 'send_message':
			return null; // Don't log send_message
		default:
			return 'thinking'; // Other tools logged as thinking
	}
}

/**
 * Format tool activity details for logging.
 */
function formatToolActivityDetails(toolName: string, args: Record<string, unknown>): string {
	switch (toolName) {
		case 'web_search':
			return `Searched for: ${args.query || 'unknown'}`;
		case 'add_resource':
			return `Added resource: ${args.title || 'unknown'}`;
		case 'add_code_example':
			return `Added code example: ${args.title || 'unknown'}`;
		case 'add_lesson':
			return `Generated lesson: ${args.title || 'unknown'}`;
		case 'get_topics':
			return 'Reviewed curriculum topics';
		case 'get_conversation_details':
			return `Reviewed conversation for topic: ${args.topic_id || 'current'}`;
		case 'get_current_extensions':
			return 'Checked existing resources and examples';
		case 'get_student_progress':
			return 'Checked student progress';
		case 'get_student_notes':
			return `Read notes for topic: ${args.topic_id || 'current'}`;
		case 'get_lessons':
			return `Fetched lessons for topic: ${args.topic_id || 'current'}`;
		default:
			return `Used tool: ${toolName}`;
	}
}

/**
 * Parse JSON string with escape sequences properly.
 * Handles \" \n \t \\ etc.
 */
function unescapeJsonString(str: string): string {
	return str
		.replace(/\\n/g, '\n')
		.replace(/\\t/g, '\t')
		.replace(/\\r/g, '\r')
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\');
}

/**
 * Extract message content from partial JSON arguments.
 * Handles escape sequences properly to avoid truncation.
 */
function extractMessageFromPartialJson(args: string): string | null {
	// Look for "message": " pattern
	const startPattern = /"message":\s*"/;
	const startMatch = args.match(startPattern);
	if (!startMatch || startMatch.index === undefined) {
		return null;
	}

	// Find where the value starts
	const valueStart = startMatch.index + startMatch[0].length;

	// Extract the value, handling escape sequences
	let value = '';
	let i = valueStart;
	while (i < args.length) {
		const char = args[i];
		if (char === '\\' && i + 1 < args.length) {
			// Escape sequence - include both chars for now
			value += args[i] + args[i + 1];
			i += 2;
		} else if (char === '"') {
			// End of string value
			break;
		} else {
			value += char;
			i++;
		}
	}

	// Unescape the value
	return unescapeJsonString(value);
}

async function handleStreamingResponse(topicId: string, message: string, agentId: string): Promise<Response> {
	const readableStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();

			function sendEvent(event: string, data: unknown) {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			}

			try {
				// Letta streaming endpoint
				const response = await fetch(`${LETTA_URL}/v1/agents/${agentId}/messages/stream`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						messages: [{ role: 'user', content: message }],
						stream_tokens: true
					})
				});

				if (!response.ok) {
					const errorData = await response.text();
					console.error('Letta API error:', errorData);
					sendEvent('error', { error: 'Letta API request failed' });
					controller.close();
					return;
				}

				const reader = response.body?.getReader();
				if (!reader) {
					sendEvent('error', { error: 'No response body' });
					controller.close();
					return;
				}

				const decoder = new TextDecoder();
				let buffer = '';
				let fullResponse = '';
				let lastSentLength = 0;

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						const data = line.slice(6);
						if (data === '[DONE]') continue;

						try {
							const event = JSON.parse(data);

							// Letta sends different message types
							if (event.message_type === 'tool_call_message') {
								const toolCall = event.tool_call;
								if (toolCall?.name === 'send_message' && toolCall.arguments) {
									// send_message contains the actual response text
									let extractedMessage: string | null = null;

									try {
										// Try to parse complete JSON first
										const args = JSON.parse(toolCall.arguments);
										if (args.message) {
											extractedMessage = args.message;
										}
									} catch {
										// Partial JSON - use custom parser that handles escapes
										extractedMessage = extractMessageFromPartialJson(toolCall.arguments);
									}

									if (extractedMessage && extractedMessage.length > lastSentLength) {
										// Send only the new content
										const newText = extractedMessage.slice(lastSentLength);
										if (newText) {
											fullResponse = extractedMessage;
											lastSentLength = extractedMessage.length;
											sendEvent('text', { text: newText });
										}
									}
								} else if (toolCall?.name) {
									// Other tool calls - parse arguments for context
									let toolArgs: Record<string, unknown> = {};
									try {
										if (toolCall.arguments) {
											toolArgs = typeof toolCall.arguments === 'string'
												? JSON.parse(toolCall.arguments)
												: toolCall.arguments;
										}
									} catch {
										// Arguments not valid JSON yet
									}

									// Log agent activity for non-send_message tools
									const activityType = mapToolNameToActivity(toolCall.name);
									if (activityType) {
										logAgentActivity({
											type: activityType,
											details: formatToolActivityDetails(toolCall.name, toolArgs),
											topicId,
											agentName: 'gideon'
										});
									}

									sendEvent('tool', {
										name: toolCall.name,
										status: 'called',
										title: toolArgs.title as string || undefined,
										query: toolArgs.query as string || undefined
									});
								}
							} else if (event.message_type === 'tool_return_message') {
								// Tool returned - emit enhanced info
								if (event.tool_return !== 'Sent message successfully.') {
									// Try to parse the result for enhanced info
									let enhancedResult = event.tool_return;
									let title: string | undefined;

									try {
										const parsed = typeof event.tool_return === 'string'
											? JSON.parse(event.tool_return)
											: event.tool_return;
										if (parsed.title) title = parsed.title;
										if (parsed.message) enhancedResult = parsed.message;
									} catch {
										// Not JSON, use as-is
									}

									sendEvent('tool', {
										name: 'tool_return',
										result: enhancedResult,
										title,
										status: event.status
									});
								}
							} else if (event.message_type === 'reasoning_message') {
								// Internal reasoning - emit as thinking event
								if (event.reasoning) {
									sendEvent('thinking', {
										reasoning: event.reasoning
									});
								}
							} else if (event.message_type === 'assistant_message') {
								// Direct assistant message (older Letta format)
								const text = event.content || '';
								if (text && text.length > lastSentLength) {
									const newText = text.slice(lastSentLength);
									fullResponse = text;
									lastSentLength = text.length;
									sendEvent('text', { text: newText });
								}
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}

				// Process any remaining buffer
				if (buffer.trim() && buffer.startsWith('data: ')) {
					const data = buffer.slice(6);
					if (data !== '[DONE]') {
						try {
							const event = JSON.parse(data);
							if (event.message_type === 'tool_call_message') {
								const toolCall = event.tool_call;
								if (toolCall?.name === 'send_message' && toolCall.arguments) {
									try {
										const args = JSON.parse(toolCall.arguments);
										if (args.message && args.message.length > lastSentLength) {
											const newText = args.message.slice(lastSentLength);
											fullResponse = args.message;
											sendEvent('text', { text: newText });
										}
									} catch {
										const extracted = extractMessageFromPartialJson(toolCall.arguments);
										if (extracted && extracted.length > lastSentLength) {
											fullResponse = extracted;
											sendEvent('text', { text: extracted.slice(lastSentLength) });
										}
									}
								}
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}

				// Save assistant response to notebook
				if (fullResponse) {
					addMessageToNotebook(topicId, {
						role: 'assistant',
						content: fullResponse,
						timestamp: new Date().toISOString()
					});

					// Trigger background curation after conversation
					triggerPostConversationCuration(topicId);
				}

				sendEvent('done', { notebook: getNotebook(topicId) });
				controller.close();
			} catch (error) {
				console.error('Letta streaming error:', error);
				sendEvent('error', { error: 'Streaming failed' });
				controller.close();
			}
		}
	});

	return new Response(readableStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

async function handleNonStreamingResponse(topicId: string, message: string, agentId: string): Promise<Response> {
	try {
		const response = await fetch(`${LETTA_URL}/v1/agents/${agentId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: message }]
			})
		});

		if (!response.ok) {
			const errorData = await response.text();
			console.error('Letta API error:', errorData);
			return json({ error: 'Letta API request failed' }, { status: response.status });
		}

		const data = await response.json();

		// Extract the response from Letta - it uses send_message tool
		let fullResponse = '';

		for (const msg of data.messages || []) {
			if (msg.message_type === 'tool_call_message') {
				const toolCall = msg.tool_call;
				if (toolCall?.name === 'send_message' && toolCall.arguments) {
					try {
						const args = JSON.parse(toolCall.arguments);
						if (args.message) {
							fullResponse += args.message;
						}
					} catch {
						// Try to extract from partial using proper parser
						const extracted = extractMessageFromPartialJson(toolCall.arguments);
						if (extracted) fullResponse += extracted;
					}
				}
			} else if (msg.message_type === 'assistant_message' && msg.content) {
				fullResponse += msg.content;
			}
		}

		// Save to notebook
		if (fullResponse) {
			addMessageToNotebook(topicId, {
				role: 'assistant',
				content: fullResponse,
				timestamp: new Date().toISOString()
			});
		}

		return json({
			message: fullResponse,
			notebook: getNotebook(topicId)
		});
	} catch (error) {
		console.error('Letta chat error:', error);
		return json({ error: 'Failed to communicate with Letta' }, { status: 500 });
	}
}
