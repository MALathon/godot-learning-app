import { json } from '@sveltejs/kit';
import { getSettings, getNotebook, addMessageToNotebook, addResourceToTopic, addCodeExampleToTopic } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// Helper to create SSE response
function createSSEStream(stream: ReadableStream<Uint8Array>): Response {
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

interface AnthropicMessage {
	role: 'user' | 'assistant';
	content: string | Array<{ type: string; text?: string; tool_use_id?: string; content?: string }>;
}

interface ToolDefinition {
	name: string;
	description: string;
	input_schema: {
		type: 'object';
		properties: Record<string, unknown>;
		required: string[];
	};
}

const tools: ToolDefinition[] = [
	{
		name: 'add_resource',
		description: 'Add a new learning resource (documentation, article, video, source code) to the current topic. Use this when you find or recommend helpful resources for the student.',
		input_schema: {
			type: 'object',
			properties: {
				title: {
					type: 'string',
					description: 'Title of the resource'
				},
				url: {
					type: 'string',
					description: 'URL to the resource'
				},
				type: {
					type: 'string',
					enum: ['docs', 'source', 'book', 'video'],
					description: 'Type of resource: docs (documentation/article), source (source code), book (book/tutorial), video (video content)'
				}
			},
			required: ['title', 'url', 'type']
		}
	},
	{
		name: 'add_code_example',
		description: 'Add a new code example to the current topic. Use this when you write a helpful code snippet that should be saved for future reference.',
		input_schema: {
			type: 'object',
			properties: {
				title: {
					type: 'string',
					description: 'Title describing what the code demonstrates'
				},
				language: {
					type: 'string',
					enum: ['gdscript', 'typescript', 'python', 'cpp'],
					description: 'Programming language of the code'
				},
				code: {
					type: 'string',
					description: 'The code snippet'
				},
				explanation: {
					type: 'string',
					description: 'Explanation of what the code does and why'
				}
			},
			required: ['title', 'language', 'code', 'explanation']
		}
	}
];

function buildSystemPrompt(topicContext: {
	title: string;
	category: string;
	description: string;
	keyPoints: string[];
	godotConnection: string;
	exercises: string[];
}): string {
	return `You are a helpful tutor teaching game engine internals through Godot.

CURRENT TOPIC: ${topicContext.title}
CATEGORY: ${topicContext.category}

TOPIC DESCRIPTION:
${topicContext.description}

KEY CONCEPTS:
${topicContext.keyPoints.map((p: string) => `- ${p}`).join('\n')}

CONNECTION TO GODOT:
${topicContext.godotConnection}

EXERCISES FOR THIS TOPIC:
${topicContext.exercises.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}

---

Your role:
- Help the student understand this topic deeply
- Answer questions about the concepts
- Provide additional code examples when helpful
- Connect concepts to their tic-tac-toe Godot project when relevant
- Encourage hands-on experimentation
- Be concise but thorough
- Use GDScript examples by default unless asked for other languages

IMPORTANT - Building the Knowledge Base:
You have tools to permanently add resources and code examples to this topic. USE THEM PROACTIVELY:

1. When you write a useful code example, use add_code_example to save it for future reference
2. When you mention or recommend a resource (documentation, tutorial, video, source code), use add_resource to add it
3. When the student asks about something and you know a great resource, add it
4. Don't ask permission - just add valuable content as you go

This helps build a personalized learning resource over time. Every good example or resource you add becomes part of the student's permanent study material.

Keep responses focused and practical. This student knows Python well but is new to game development and Godot.`;
}

export const POST: RequestHandler = async ({ request }) => {
	const settings = getSettings();

	if (!settings.apiKey) {
		return json({ error: 'API key not configured' }, { status: 400 });
	}

	const body = await request.json();
	const { topicId, message, topicContext, stream = false } = body;

	// Save user message to notebook
	addMessageToNotebook(topicId, {
		role: 'user',
		content: message,
		timestamp: new Date().toISOString()
	});

	// Get conversation history
	const notebook = getNotebook(topicId);

	// Build messages for Claude
	const messages: AnthropicMessage[] = notebook.messages.map((m) => ({
		role: m.role,
		content: m.content
	}));

	const systemPrompt = buildSystemPrompt(topicContext);

	const apiSettings = { apiKey: settings.apiKey, model: settings.model };

	// Streaming mode
	if (stream) {
		return handleStreamingResponse(apiSettings, messages, systemPrompt, topicId);
	}

	// Non-streaming mode (original behavior)
	return handleNonStreamingResponse(apiSettings, messages, systemPrompt, topicId);
};

async function handleStreamingResponse(
	settings: { apiKey: string; model: string },
	messages: AnthropicMessage[],
	systemPrompt: string,
	topicId: string
): Promise<Response> {
	let currentMessages = [...messages];
	let fullResponse = '';
	const toolsUsed: Array<{ tool: string; result: string }> = [];

	const readableStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();

			function sendEvent(event: string, data: unknown) {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			}

			try {
				let continueLoop = true;

				while (continueLoop) {
					const response = await fetch('https://api.anthropic.com/v1/messages', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-api-key': settings.apiKey,
							'anthropic-version': '2023-06-01'
						},
						body: JSON.stringify({
							model: settings.model,
							max_tokens: 2048,
							system: systemPrompt,
							messages: currentMessages,
							tools: tools,
							stream: true
						})
					});

					if (!response.ok) {
						const errorData = await response.json();
						sendEvent('error', { error: errorData.error?.message || 'API request failed' });
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
					let currentToolUse: { id: string; name: string; input: string } | null = null;
					let stopReason = '';
					const contentBlocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = [];

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

								switch (event.type) {
									case 'content_block_start':
										if (event.content_block.type === 'text') {
											contentBlocks.push({ type: 'text', text: '' });
										} else if (event.content_block.type === 'tool_use') {
											currentToolUse = {
												id: event.content_block.id,
												name: event.content_block.name,
												input: ''
											};
											contentBlocks.push({
												type: 'tool_use',
												id: event.content_block.id,
												name: event.content_block.name,
												input: {}
											});
										}
										break;

									case 'content_block_delta':
										if (event.delta.type === 'text_delta') {
											const text = event.delta.text;
											fullResponse += text;
											// Find the last text block and append
											const lastTextBlock = [...contentBlocks].reverse().find(b => b.type === 'text');
											if (lastTextBlock) lastTextBlock.text = (lastTextBlock.text || '') + text;
											sendEvent('text', { text });
										} else if (event.delta.type === 'input_json_delta' && currentToolUse) {
											currentToolUse.input += event.delta.partial_json;
										}
										break;

									case 'content_block_stop':
										if (currentToolUse) {
											// Parse the complete input
											try {
												const parsedInput = JSON.parse(currentToolUse.input);
												const toolBlock = contentBlocks.find(
													b => b.type === 'tool_use' && b.id === currentToolUse!.id
												);
												if (toolBlock) toolBlock.input = parsedInput;
											} catch {
												// Input parsing failed, leave as string
											}
											currentToolUse = null;
										}
										break;

									case 'message_delta':
										if (event.delta.stop_reason) {
											stopReason = event.delta.stop_reason;
										}
										break;
								}
							} catch {
								// Skip invalid JSON
							}
						}
					}

					// Handle tool use if needed
					if (stopReason === 'tool_use') {
						const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

						// Add assistant message with all content to conversation
						currentMessages.push({
							role: 'assistant',
							content: contentBlocks.map(b => {
								if (b.type === 'text') return { type: 'text', text: b.text };
								return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
							})
						});

						// Process each tool
						const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

						for (const toolUse of toolUseBlocks) {
							let result = '';
							const input = toolUse.input as Record<string, string>;

							if (toolUse.name === 'add_resource') {
								const { title, url, type } = input;
								addResourceToTopic(topicId, {
									title,
									url,
									type: type as 'docs' | 'source' | 'book' | 'video'
								});
								result = `Added resource "${title}" to the topic.`;
								toolsUsed.push({ tool: 'add_resource', result });
								sendEvent('tool', { name: 'add_resource', title });
							} else if (toolUse.name === 'add_code_example') {
								const { title, language, code, explanation } = input;
								addCodeExampleToTopic(topicId, {
									title,
									language: language as 'gdscript' | 'typescript' | 'python' | 'cpp',
									code,
									explanation
								});
								result = `Added code example "${title}" to the topic.`;
								toolsUsed.push({ tool: 'add_code_example', result });
								sendEvent('tool', { name: 'add_code_example', title });
							}

							toolResults.push({
								type: 'tool_result',
								tool_use_id: toolUse.id!,
								content: result
							});
						}

						currentMessages.push({
							role: 'user',
							content: toolResults
						});
					} else {
						continueLoop = false;
					}
				}

				// Save assistant response to notebook
				addMessageToNotebook(topicId, {
					role: 'assistant',
					content: fullResponse,
					timestamp: new Date().toISOString()
				});

				sendEvent('done', {
					notebook: getNotebook(topicId),
					toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
				});

				controller.close();
			} catch (error) {
				console.error('Streaming error:', error);
				const encoder = new TextEncoder();
				controller.enqueue(
					encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Streaming failed' })}\n\n`)
				);
				controller.close();
			}
		}
	});

	return createSSEStream(readableStream);
}

async function handleNonStreamingResponse(
	settings: { apiKey: string; model: string },
	messages: AnthropicMessage[],
	systemPrompt: string,
	topicId: string
): Promise<Response> {
	try {
		let currentMessages = [...messages];
		let finalResponse = '';
		const toolsUsed: Array<{ tool: string; result: string }> = [];

		let continueLoop = true;
		while (continueLoop) {
			const response = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': settings.apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model: settings.model,
					max_tokens: 2048,
					system: systemPrompt,
					messages: currentMessages,
					tools: tools
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				console.error('Anthropic API error:', errorData);
				return json({ error: errorData.error?.message || 'API request failed' }, { status: response.status });
			}

			const data = await response.json();

			if (data.stop_reason === 'tool_use') {
				const toolUseBlocks = data.content.filter((block: { type: string }) => block.type === 'tool_use');
				const textBlocks = data.content.filter((block: { type: string }) => block.type === 'text');

				for (const block of textBlocks) {
					finalResponse += block.text;
				}

				currentMessages.push({
					role: 'assistant',
					content: data.content
				});

				const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

				for (const toolUse of toolUseBlocks) {
					let result = '';

					if (toolUse.name === 'add_resource') {
						const { title, url, type } = toolUse.input;
						addResourceToTopic(topicId, { title, url, type });
						result = `Added resource "${title}" to the topic.`;
						toolsUsed.push({ tool: 'add_resource', result });
					} else if (toolUse.name === 'add_code_example') {
						const { title, language, code, explanation } = toolUse.input;
						addCodeExampleToTopic(topicId, { title, language, code, explanation });
						result = `Added code example "${title}" to the topic.`;
						toolsUsed.push({ tool: 'add_code_example', result });
					}

					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolUse.id,
						content: result
					});
				}

				currentMessages.push({
					role: 'user',
					content: toolResults
				});
			} else {
				for (const block of data.content) {
					if (block.type === 'text') {
						finalResponse += block.text;
					}
				}
				continueLoop = false;
			}
		}

		addMessageToNotebook(topicId, {
			role: 'assistant',
			content: finalResponse,
			timestamp: new Date().toISOString()
		});

		return json({
			message: finalResponse,
			notebook: getNotebook(topicId),
			toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
		});
	} catch (error) {
		console.error('Chat error:', error);
		return json({ error: 'Failed to communicate with Claude' }, { status: 500 });
	}
}
