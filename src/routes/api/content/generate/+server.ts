import { json } from '@sveltejs/kit';
import { getSettings, saveTopicContent, getTopicContent, getNotebook, logAgentActivity, addNotification, logUsage } from '$lib/server/storage';
import { topics } from '$lib/data/topics';
import type { RequestHandler } from './$types';

const CONTENT_GENERATION_SYSTEM_PROMPT = `You are an expert technical writer creating educational content for a Godot game engine learning application. Your task is to write book-like prose content for a specific topic.

IMPORTANT GUIDELINES:
1. Write in a clear, engaging, and educational style - like a well-written technical book
2. Assume the reader knows Python but is new to game development and Godot
3. Use practical examples that connect to game development scenarios
4. Progress from beginner concepts to more advanced ones
5. Include GDScript code examples where helpful (using markdown code blocks)
6. Keep sections focused and digestible - each should take 2-5 minutes to read
7. Connect concepts to how they work in Godot specifically
8. Use analogies and real-world examples to explain complex ideas

OUTPUT FORMAT (JSON):
{
  "introduction": "An engaging 2-3 paragraph introduction explaining why this topic matters and what the reader will learn. Set the context and make them want to keep reading.",
  "sections": [
    {
      "title": "Section Title",
      "content": "Markdown prose content for this section. Can include **bold**, *italic*, code blocks, lists, etc.",
      "level": "beginner" | "intermediate" | "advanced"
    }
  ],
  "summary": "A concise summary of key takeaways - 3-5 bullet points or a short paragraph.",
  "nextSteps": "Suggestions for what to explore next and how this connects to other topics."
}

Write 3-5 substantial sections that progressively build understanding. Each section should be 200-500 words.`;

function buildTopicPrompt(topic: typeof topics[0], conversationContext: string | null): string {
	let prompt = `Generate comprehensive educational content for this Godot learning topic:

TOPIC: ${topic.title}
CATEGORY: ${topic.category}
DESCRIPTION: ${topic.description}

KEY POINTS TO COVER:
${topic.keyPoints.map(p => `- ${p}`).join('\n')}

GODOT CONNECTION:
${topic.godotConnection}

EXERCISES (for context on what learners will practice):
${topic.exercises.map((e, i) => `${i + 1}. ${e}`).join('\n')}

EXISTING CODE EXAMPLES (reference these concepts):
${topic.codeExamples.map(ex => `- ${ex.title}: ${ex.explanation}`).join('\n')}`;

	if (conversationContext) {
		prompt += `

LEARNER CONTEXT (from recent conversations):
${conversationContext}

Tailor the content to address any confusion or questions apparent from the conversation history.`;
	}

	prompt += `

Generate the educational prose content as JSON. Make it engaging, thorough, and practical.`;

	return prompt;
}

export const POST: RequestHandler = async ({ request }) => {
	const settings = getSettings();

	if (!settings.apiKey) {
		return json({ error: 'API key not configured' }, { status: 400 });
	}

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

	// Get conversation history for context
	let conversationContext: string | null = null;
	try {
		const notebook = getNotebook(topicId);
		if (notebook.messages.length > 0) {
			const recentMessages = notebook.messages.slice(-10);
			conversationContext = recentMessages
				.map(m => `${m.role}: ${m.content.slice(0, 500)}`)
				.join('\n\n');
		}
	} catch {
		// No conversation history - that's fine
	}

	// Log that we're generating content
	logAgentActivity({
		type: 'add_lesson',
		details: `Generating educational content for: ${topic.title}`,
		topicId,
		agentName: 'gideon'
	});

	try {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': settings.apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: settings.model,
				max_tokens: 8192,
				system: CONTENT_GENERATION_SYSTEM_PROMPT,
				messages: [
					{
						role: 'user',
						content: buildTopicPrompt(topic, conversationContext)
					}
				]
			})
		});

		if (!response.ok) {
			const errorData = await response.json();
			console.error('Anthropic API error:', errorData);
			return json({
				error: errorData.error?.message || 'API request failed'
			}, { status: response.status });
		}

		const data = await response.json();

		// Log API usage for cost tracking
		if (data.usage) {
			logUsage({
				model: settings.model,
				inputTokens: data.usage.input_tokens || 0,
				outputTokens: data.usage.output_tokens || 0,
				source: 'prose',
				topicId
			});
		}

		// Extract the text content
		const textContent = data.content
			.filter((block: { type: string }) => block.type === 'text')
			.map((block: { text: string }) => block.text)
			.join('');

		// Parse the JSON from the response
		let content;
		try {
			// Try to extract JSON from the response (might be wrapped in markdown)
			const jsonMatch = textContent.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				content = JSON.parse(jsonMatch[0]);
			} else {
				throw new Error('No JSON found in response');
			}
		} catch (parseError) {
			console.error('Failed to parse content JSON:', parseError);
			console.error('Raw response:', textContent.slice(0, 500));
			return json({
				error: 'Failed to parse generated content',
				rawContent: textContent.slice(0, 1000)
			}, { status: 500 });
		}

		// Validate the content structure
		if (!content.introduction || !content.sections || !Array.isArray(content.sections)) {
			return json({
				error: 'Invalid content structure',
				content
			}, { status: 500 });
		}

		// Add metadata
		content.generatedAt = new Date().toISOString();
		content.generatedBy = 'ai';

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
			details: `Generated ${content.sections.length} sections for: ${topic.title}`,
			topicId,
			agentName: 'gideon'
		});

		return json({
			success: true,
			message: `Generated content for ${topic.title}`,
			content,
			sectionsCount: content.sections.length
		});
	} catch (error) {
		console.error('Content generation error:', error);
		return json({
			error: 'Failed to generate content',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// GET - Retrieve topic content
export const GET: RequestHandler = async ({ url }) => {
	const topicId = url.searchParams.get('topicId');

	if (!topicId) {
		return json({ error: 'topicId query parameter is required' }, { status: 400 });
	}

	const content = getTopicContent(topicId);

	if (!content) {
		return json({
			exists: false,
			message: 'No generated content for this topic'
		});
	}

	return json({
		exists: true,
		content
	});
};
