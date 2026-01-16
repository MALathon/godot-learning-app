import { json } from '@sveltejs/kit';
import { getNotebook, addMessageToNotebook } from '$lib/server/storage';
import type { RequestHandler } from './$types';

const LETTA_URL = 'http://localhost:8283';
const AGENT_ID = 'agent-35d63804-8335-4f62-b363-0bdb415312cb';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { topicId, message, topicContext, stream = false } = body;

	// Save user message to notebook (local history)
	addMessageToNotebook(topicId, {
		role: 'user',
		content: message,
		timestamp: new Date().toISOString()
	});

	// Build context-aware message for Letta
	const contextMessage = `[Context: User is studying "${topicContext.title}" (${topicContext.category})]

${message}`;

	if (stream) {
		return handleStreamingResponse(topicId, contextMessage);
	}

	return handleNonStreamingResponse(topicId, contextMessage);
};

async function handleStreamingResponse(topicId: string, message: string): Promise<Response> {
	const readableStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();

			function sendEvent(event: string, data: unknown) {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			}

			try {
				// Letta streaming endpoint
				const response = await fetch(`${LETTA_URL}/v1/agents/${AGENT_ID}/messages/stream`, {
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
									// Arguments come in chunks, try to extract message
									try {
										// Try to parse complete JSON
										const args = JSON.parse(toolCall.arguments);
										if (args.message) {
											const text = args.message;
											if (!fullResponse.endsWith(text)) {
												// Avoid duplicates - only send new content
												const newText = text.slice(fullResponse.length);
												if (newText) {
													fullResponse = text;
													sendEvent('text', { text: newText });
												}
											}
										}
									} catch {
										// Partial JSON - extract message content if possible
										const match = toolCall.arguments.match(/"message":\s*"([^"]*)/);
										if (match && match[1]) {
											const partialText = match[1];
											if (partialText.length > fullResponse.length) {
												const newText = partialText.slice(fullResponse.length);
												fullResponse = partialText;
												sendEvent('text', { text: newText });
											}
										}
									}
								} else if (toolCall?.name) {
									// Other tool calls
									sendEvent('tool', {
										name: toolCall.name,
										status: 'called'
									});
								}
							} else if (event.message_type === 'tool_return_message') {
								// Tool returned
								if (event.tool_return !== 'Sent message successfully.') {
									sendEvent('tool', {
										name: 'tool_return',
										result: event.tool_return,
										status: event.status
									});
								}
							} else if (event.message_type === 'reasoning_message') {
								// Internal reasoning - skip for now (could show as "thinking...")
							} else if (event.message_type === 'assistant_message') {
								// Direct assistant message (older Letta format)
								const text = event.content || '';
								if (text && !fullResponse.includes(text)) {
									fullResponse += text;
									sendEvent('text', { text });
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

async function handleNonStreamingResponse(topicId: string, message: string): Promise<Response> {
	try {
		const response = await fetch(`${LETTA_URL}/v1/agents/${AGENT_ID}/messages`, {
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
						// Try to extract from partial
						const match = toolCall.arguments.match(/"message":\s*"([^"]*)"/);
						if (match) fullResponse += match[1];
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
