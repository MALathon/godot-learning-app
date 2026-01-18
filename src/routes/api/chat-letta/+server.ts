import { json } from '@sveltejs/kit';
import { getNotebook, addMessageToNotebook, logAgentActivity } from '$lib/server/storage';
import { LETTA_URL, getGideonAgentId, triggerBackgroundCuration } from '$lib/server/letta';
import type { RequestHandler } from './$types';

/**
 * Type for tool call arguments parsed from JSON.
 */
interface ToolArgs {
	message?: string;
	title?: string;
	query?: string;
	topic_id?: string;
	[key: string]: unknown;
}

export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { topicId, message, topicContext, stream = false, learningGoal } = body;

	// Input validation
	if (!topicId || typeof topicId !== 'string') {
		return json({ error: 'topicId is required' }, { status: 400 });
	}
	if (!message || typeof message !== 'string') {
		return json({ error: 'message is required' }, { status: 400 });
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

	// Build context-aware message for Letta
	let contextMessage: string;
	const goalSection = learningGoal ? `\n[Learning Goal: ${learningGoal}]` : '';

	if (topicContext?.title && topicContext?.category) {
		// Topic-specific context
		const notesSection = topicContext.notes ? `\n[User's notes: ${topicContext.notes}]` : '';
		contextMessage = `[Context: User is studying "${topicContext.title}" (${topicContext.category})]
[Key concepts: ${topicContext.keyPoints?.slice(0, 3).join(', ') || 'N/A'}]
[Godot connection: ${topicContext.godotConnection || 'N/A'}]${goalSection}${notesSection}

${message}`;
	} else {
		// General context (homepage, resources page, etc.)
		contextMessage = `[Context: User is on the learning app homepage or browsing - no specific topic selected]
[Mode: General Godot learning assistance]${goalSection}

${message}`;
	}

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
			let isClosed = false;

			function sendEvent(event: string, data: unknown) {
				if (isClosed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Controller may be closed
				}
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
					isClosed = true;
					controller.close();
					return;
				}

				const reader = response.body?.getReader();
				if (!reader) {
					sendEvent('error', { error: 'No response body' });
					isClosed = true;
					controller.close();
					return;
				}

				const decoder = new TextDecoder();
				let buffer = '';
				let fullResponse = '';

				// Track accumulated arguments per tool call (Letta sends deltas, not full values)
				const toolCallArgs: Map<string, string> = new Map();
				let lastSentLength = 0;

				// Accumulate reasoning for batch sending
				let reasoningBuffer = '';
				let reasoningTimeout: ReturnType<typeof setTimeout> | null = null;

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
								const toolCallId = toolCall?.tool_call_id || 'default';

								if (toolCall?.name === 'send_message') {
									// Letta streams arguments as DELTAS - accumulate them
									if (toolCall.arguments) {
										const currentArgs = toolCallArgs.get(toolCallId) || '';
										const newArgs = currentArgs + toolCall.arguments;
										toolCallArgs.set(toolCallId, newArgs);

										// Try to extract message from accumulated arguments
										let extractedMessage: string | null = null;
										try {
											const parsed = JSON.parse(newArgs);
											if (parsed.message) {
												extractedMessage = parsed.message;
											}
										} catch {
											// Not complete JSON yet - try partial extraction
											extractedMessage = extractMessageFromPartialJson(newArgs);
										}

										if (extractedMessage && extractedMessage.length > lastSentLength) {
											const newText = extractedMessage.slice(lastSentLength);
											if (newText) {
												fullResponse = extractedMessage;
												lastSentLength = extractedMessage.length;
												sendEvent('text', { text: newText });
											}
										}
									}
								} else if (toolCall?.name) {
									// Other tool calls - accumulate arguments
									if (toolCall.arguments) {
										const currentArgs = toolCallArgs.get(toolCallId) || '';
										toolCallArgs.set(toolCallId, currentArgs + toolCall.arguments);
									}

									// Only emit tool event on first chunk (when no args accumulated yet)
									if (!toolCallArgs.has(toolCallId) || toolCallArgs.get(toolCallId) === toolCall.arguments) {
										sendEvent('tool', {
											name: toolCall.name,
											status: 'called'
										});
									}
								}
							} else if (event.message_type === 'tool_return_message') {
								// Tool returned - log activity and emit info
								const toolName = event.name || 'unknown';

								// Try to get final args for this tool call
								let toolArgs: ToolArgs = {};
								const toolCallId = event.tool_call_id;
								if (toolCallId && toolCallArgs.has(toolCallId)) {
									try {
										toolArgs = JSON.parse(toolCallArgs.get(toolCallId)!);
									} catch {
										// Args not valid JSON
									}
								}

								// Log agent activity for non-send_message tools
								if (toolName !== 'send_message') {
									const activityType = mapToolNameToActivity(toolName);
									if (activityType) {
										logAgentActivity({
											type: activityType,
											details: formatToolActivityDetails(toolName, toolArgs),
											topicId,
											agentName: 'gideon'
										});
									}

									if (event.tool_return !== 'Sent message successfully.') {
										sendEvent('tool', {
											name: toolName,
											status: event.status,
											result: typeof event.tool_return === 'string'
												? event.tool_return.slice(0, 200)
												: 'completed'
										});
									}
								}
							} else if (event.message_type === 'reasoning_message') {
								// Batch reasoning messages to avoid overwhelming the UI
								if (event.reasoning) {
									reasoningBuffer += event.reasoning;

									// Debounce: send accumulated reasoning after 100ms of no new tokens
									if (reasoningTimeout) clearTimeout(reasoningTimeout);
									reasoningTimeout = setTimeout(() => {
										if (reasoningBuffer) {
											sendEvent('thinking', { reasoning: reasoningBuffer });
											reasoningBuffer = '';
										}
									}, 100);
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
							// Skip malformed JSON in stream - can happen with partial chunks
						}
					}
				}

				// Flush any remaining reasoning
				if (reasoningTimeout) clearTimeout(reasoningTimeout);
				if (reasoningBuffer) {
					sendEvent('thinking', { reasoning: reasoningBuffer });
				}

				// Save assistant response to notebook
				if (fullResponse) {
					addMessageToNotebook(topicId, {
						role: 'assistant',
						content: fullResponse,
						timestamp: new Date().toISOString()
					});

					// Trigger background curation after conversation
					triggerBackgroundCuration(topicId, 'post_conversation');
				}

				sendEvent('done', { notebook: getNotebook(topicId) });
				isClosed = true;
				controller.close();
			} catch (error) {
				console.error('Letta streaming error:', error);
				if (!isClosed) {
					sendEvent('error', { error: 'Streaming failed' });
					isClosed = true;
					controller.close();
				}
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
					} catch (parseError) {
						// JSON parse failed, try custom partial parser
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
