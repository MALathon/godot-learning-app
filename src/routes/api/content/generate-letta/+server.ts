import { json } from '@sveltejs/kit';
import { saveTopicContent, getTopicContent, getNotebook, logAgentActivity, addNotification } from '$lib/server/storage';
import { topics } from '$lib/data/topics';
import { LETTA_URL, getGideonAgentId } from '$lib/server/letta';
import type { RequestHandler } from './$types';

// POST - Generate prose content using Letta agent
export const POST: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { topicId, regenerate = false } = body;

	if (!topicId || typeof topicId !== 'string') {
		return json({ error: 'topicId is required' }, { status: 400 });
	}

	// Find the topic
	const topic = topics.find(t => t.id === topicId);
	if (!topic) {
		return json({ error: `Topic not found: ${topicId}` }, { status: 404 });
	}

	// Check if content already exists
	const existingContent = getTopicContent(topicId);
	if (existingContent && !regenerate) {
		return json({
			message: 'Content already exists',
			content: existingContent,
			cached: true
		});
	}

	// Get the Gideon agent ID
	const agentId = getGideonAgentId();
	if (!agentId) {
		return json({
			error: 'No agent available. Run setup_agents.py first.',
			hint: 'cd letta && python setup_agents.py'
		}, { status: 503 });
	}

	// Get conversation history for context
	let conversationContext = '';
	try {
		const notebook = getNotebook(topicId);
		if (notebook.messages.length > 0) {
			const recentMessages = notebook.messages.slice(-10);
			conversationContext = `
LEARNER CONVERSATION HISTORY:
${recentMessages.map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n\n')}
`;
		}
	} catch {
		// No conversation history - that's fine
	}

	// Log that we're generating content
	logAgentActivity({
		type: 'add_lesson',
		details: `Generating educational prose for: ${topic.title}`,
		topicId,
		agentName: 'gideon'
	});

	// Build the prose generation prompt
	const prosePrompt = `
You are creating comprehensive educational prose content for the topic: ${topic.title}

TOPIC DETAILS:
- Category: ${topic.category}
- Description: ${topic.description}
- Godot Connection: ${topic.godotConnection}

KEY POINTS TO COVER:
${topic.keyPoints.map(p => `- ${p}`).join('\n')}

EXERCISES (for context):
${topic.exercises.map((e, i) => `${i + 1}. ${e}`).join('\n')}
${conversationContext}

YOUR TASK: Generate a comprehensive educational article with the following structure.
Write in an engaging, book-like style - imagine you're writing a chapter of "The Godot Developer's Handbook".

The content should be for someone who knows Python but is new to game development.
Include practical GDScript code examples where helpful.
Progress from beginner concepts to more advanced ones.

You MUST respond with valid JSON in exactly this format:
{
  "introduction": "2-3 paragraph introduction explaining why this topic matters",
  "sections": [
    {
      "title": "Section Title",
      "content": "Markdown prose content for this section (200-500 words). Use **bold**, *italic*, code blocks with \`\`\`gdscript, lists, etc.",
      "level": "beginner"
    },
    {
      "title": "Next Section",
      "content": "More content here...",
      "level": "intermediate"
    }
  ],
  "summary": "Key takeaways - 3-5 bullet points",
  "nextSteps": "What to explore next and connections to other topics"
}

Write 3-5 substantial sections. Be thorough, practical, and engaging.
Respond ONLY with the JSON object, no additional text.
`.trim();

	try {
		// Send to Letta agent
		const response = await fetch(`${LETTA_URL}/v1/agents/${agentId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: prosePrompt }]
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Letta API error:', errorText);
			return json({
				error: 'Failed to generate content',
				details: errorText
			}, { status: response.status });
		}

		const data = await response.json();

		// Extract the assistant's response from Letta messages
		// Letta uses send_message tool to communicate
		let assistantResponse = '';
		for (const msg of data.messages || []) {
			if (msg.message_type === 'tool_call_message') {
				const toolCall = msg.tool_call;
				if (toolCall?.name === 'send_message' && toolCall.arguments) {
					try {
						const args = JSON.parse(toolCall.arguments);
						if (args.message) {
							assistantResponse += args.message;
						}
					} catch {
						// Try to extract message from partial JSON
						const match = toolCall.arguments.match(/"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/s);
						if (match) {
							assistantResponse += match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
						}
					}
				}
			} else if (msg.message_type === 'assistant_message' && msg.content) {
				assistantResponse += msg.content;
			}
		}

		// Try to extract JSON from the response
		let content;
		try {
			// Look for JSON object in the response
			const jsonMatch = assistantResponse.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				content = JSON.parse(jsonMatch[0]);
			} else {
				// If no JSON found, create a structured response from the text
				content = {
					introduction: assistantResponse.slice(0, 500),
					sections: [
						{
							title: 'Overview',
							content: assistantResponse,
							level: 'beginner'
						}
					],
					summary: 'See the content above for key takeaways.',
					nextSteps: 'Continue exploring related topics.'
				};
			}
		} catch (parseError) {
			console.error('Failed to parse content JSON:', parseError);
			// Create fallback structure
			content = {
				introduction: `This topic covers ${topic.title} - ${topic.description}`,
				sections: [
					{
						title: 'Generated Content',
						content: assistantResponse || 'Content generation in progress. The agent is working on creating comprehensive materials for this topic.',
						level: 'beginner'
					}
				],
				summary: 'Content is being generated. Check back soon.',
				nextSteps: 'The agent is still processing this topic.'
			};
		}

		// Validate and ensure required fields
		if (!content.introduction) {
			content.introduction = `This topic covers ${topic.title} - ${topic.description}`;
		}
		if (!content.sections || !Array.isArray(content.sections)) {
			content.sections = [];
		}
		if (!content.summary) {
			content.summary = 'See the sections above for key concepts.';
		}
		if (!content.nextSteps) {
			content.nextSteps = 'Continue with the next topic in the curriculum.';
		}

		// Add metadata
		content.generatedAt = new Date().toISOString();
		content.generatedBy = 'letta';
		content.agentId = agentId;

		// Save to storage
		saveTopicContent(topicId, content);

		// Add notification for new content
		addNotification({
			type: 'prose',
			topicId,
			title: `New content: ${topic.title}`,
			description: `Generated ${content.sections.length} educational sections`
		});

		// Log completion
		logAgentActivity({
			type: 'add_lesson',
			details: `Generated ${content.sections.length} prose sections for: ${topic.title}`,
			topicId,
			agentName: 'gideon'
		});

		return json({
			success: true,
			message: `Generated content for ${topic.title}`,
			content,
			sectionsCount: content.sections.length,
			source: 'letta'
		});
	} catch (error) {
		console.error('Content generation error:', error);
		return json({
			error: 'Failed to generate content',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
