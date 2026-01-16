#!/usr/bin/env python3
"""
Letta Multi-Agent Setup for Godot Learning App

This script creates a multi-agent system with:
1. Gideon (Chat Agent) - Primary tutor for real-time conversations
2. Curator (Sleeptime Agent) - Background processor for content curation

Both agents share memory blocks for coordinated learning support.

Prerequisites:
- pip install letta-client requests
- Set ANTHROPIC_API_KEY environment variable
- Start local Letta server: letta server
- Your learning app running on localhost:5999
"""

import os
import json
import inspect
import requests
from letta_client import Letta

# Configuration
LETTA_BASE_URL = os.getenv("LETTA_BASE_URL", "http://localhost:8283")
LEARNING_APP_URL = os.getenv("LEARNING_APP_URL", "http://localhost:5999")

# Initialize Letta client for LOCAL server (no api_key needed)
client = Letta(base_url=LETTA_BASE_URL)

# =============================================================================
# Custom Tool Definitions
# Each function must be self-contained with imports inside
# =============================================================================

def make_get_topics(app_url: str):
    """Factory to create get_topics tool with embedded URL."""
    def get_topics() -> str:
        """
        Get all available topics in the Godot learning curriculum.
        Returns a list of topics with their IDs, titles, and descriptions.
        Use this to understand what topics exist before adding resources.

        Returns:
            str: JSON string of topics with id, title, category, and description
        """
        import json
        import requests

        try:
            response = requests.get(f"{app_url}/api/letta?action=topics")
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return get_topics


def make_get_recent_conversations(app_url: str):
    """Factory to create get_recent_conversations tool with embedded URL."""
    def get_recent_conversations() -> str:
        """
        Get summaries of recent chat conversations from the learning notebooks.
        Use this to understand what the student has been studying and asking about.
        Returns notebook metadata including topic IDs and message counts.

        Returns:
            str: JSON string of notebooks with topic_id, title, message_count, last_updated
        """
        import json
        import requests

        try:
            response = requests.get(f"{app_url}/api/letta?action=notebooks")
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return get_recent_conversations


def make_get_conversation_details(app_url: str):
    """Factory to create get_conversation_details tool with embedded URL."""
    def get_conversation_details(topic_id: str) -> str:
        """
        Get the full conversation history for a specific topic.
        Use this to analyze what questions the student asked and what they're struggling with.

        Args:
            topic_id: The ID of the topic (e.g., 'game-loop', 'signals', 'scene-tree')

        Returns:
            str: JSON string of conversation messages for that topic
        """
        import json
        import requests

        try:
            response = requests.get(f"{app_url}/api/letta?action=notebook&topicId={topic_id}")
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return get_conversation_details


def make_get_current_extensions(app_url: str):
    """Factory to create get_current_extensions tool with embedded URL."""
    def get_current_extensions() -> str:
        """
        Get all resources and code examples that have been dynamically added.
        Use this to see what content has already been curated to avoid duplicates.

        Returns:
            str: JSON string of all dynamically added resources and code examples
        """
        import json
        import requests

        try:
            response = requests.get(f"{app_url}/api/letta?action=extensions")
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return get_current_extensions


def make_get_student_progress(app_url: str):
    """Factory to create get_student_progress tool with embedded URL."""
    def get_student_progress() -> str:
        """
        Get the student's learning progress across all topics.
        Shows which topics are completed, exercises done, and last visit times.
        Use this to understand the student's learning journey and identify focus areas.

        Returns:
            str: JSON string of progress data per topic
        """
        import json
        import requests

        try:
            response = requests.get(f"{app_url}/api/progress")
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return get_student_progress


def make_get_student_notes(app_url: str):
    """Factory to create get_student_notes tool with embedded URL."""
    def get_student_notes(topic_id: str) -> str:
        """
        Get the student's personal notes for a specific topic.
        Notes contain the student's own insights, questions, and reflections.
        Use this to understand what the student found important or confusing.

        Args:
            topic_id: The ID of the topic (e.g., 'game-loop', 'signals', 'scene-tree')

        Returns:
            str: The student's notes for that topic, or empty if none
        """
        import json
        import requests

        try:
            response = requests.get(f"{app_url}/api/progress")
            if response.ok:
                data = response.json()
                topic_progress = data.get('topics', {}).get(topic_id, {})
                notes = topic_progress.get('notes', '')
                return json.dumps({
                    'topicId': topic_id,
                    'notes': notes,
                    'hasNotes': bool(notes.strip())
                }, indent=2)
            return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return get_student_notes


def make_add_resource(app_url: str):
    """Factory to create add_resource tool with embedded URL."""
    def add_resource(topic_id: str, title: str, url: str, resource_type: str) -> str:
        """
        Add a learning resource to a topic in the Godot learning app.
        The resource will appear in the topic's Resources section.

        Args:
            topic_id: The topic ID (e.g., 'game-loop', 'signals', 'scene-tree')
            title: Display title for the resource
            url: URL to the resource
            resource_type: One of 'docs', 'source', 'book', 'video'

        Returns:
            str: JSON confirmation of the added resource
        """
        import json
        import requests

        try:
            response = requests.post(
                f"{app_url}/api/letta",
                json={
                    "action": "add_resource",
                    "topicId": topic_id,
                    "title": title,
                    "url": url,
                    "type": resource_type
                }
            )
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code} - {response.text}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return add_resource


def make_add_code_example(app_url: str):
    """Factory to create add_code_example tool with embedded URL."""
    def add_code_example(topic_id: str, title: str, language: str, code: str, explanation: str) -> str:
        """
        Add a code example to a topic in the Godot learning app.
        The example will appear in the topic's Code Examples section.

        Args:
            topic_id: The topic ID (e.g., 'game-loop', 'signals', 'scene-tree')
            title: Display title for the code example
            language: Programming language - one of 'gdscript', 'python', 'typescript', 'cpp'
            code: The actual code snippet
            explanation: Explanation of what the code does and why it's useful

        Returns:
            str: JSON confirmation of the added code example
        """
        import json
        import requests

        try:
            response = requests.post(
                f"{app_url}/api/letta",
                json={
                    "action": "add_code_example",
                    "topicId": topic_id,
                    "title": title,
                    "language": language,
                    "code": code,
                    "explanation": explanation
                }
            )
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code} - {response.text}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return add_code_example


def make_add_lesson(app_url: str):
    """Factory to create add_lesson tool with embedded URL."""
    def add_lesson(
        topic_id: str,
        title: str,
        difficulty: str,
        introduction: str,
        concepts: str,
        explanation: str,
        exercises: str,
        connections: str,
        generated_for: str
    ) -> str:
        """
        Generate and add a structured lesson to a topic.
        Lessons are comprehensive learning materials created based on student needs.

        Args:
            topic_id: The topic ID (e.g., 'game-loop', 'signals')
            title: Lesson title (e.g., "Understanding Delta Time in Practice")
            difficulty: One of 'beginner', 'intermediate', 'advanced'
            introduction: Why this lesson matters to the student (1-2 paragraphs)
            concepts: Key points as JSON array of strings (e.g., '["point 1", "point 2"]')
            explanation: Deep explanation in markdown format
            exercises: Practice prompts as JSON array of strings
            connections: Links to other topics as JSON array of strings
            generated_for: What triggered this lesson (e.g., "User asked about delta time")

        Returns:
            str: JSON confirmation of the added lesson
        """
        import json
        import requests

        try:
            # Parse JSON arrays
            concepts_list = json.loads(concepts) if isinstance(concepts, str) else concepts
            exercises_list = json.loads(exercises) if isinstance(exercises, str) else exercises
            connections_list = json.loads(connections) if isinstance(connections, str) else connections

            response = requests.post(
                f"{app_url}/api/letta/lessons",
                json={
                    "topicId": topic_id,
                    "title": title,
                    "difficulty": difficulty,
                    "content": {
                        "introduction": introduction,
                        "concepts": concepts_list,
                        "explanation": explanation,
                        "exercises": exercises_list,
                        "connections": connections_list
                    },
                    "generatedFor": generated_for
                }
            )
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code} - {response.text}"
        except Exception as e:
            return f"Error: {e}"

    return add_lesson


def make_get_lessons(app_url: str):
    """Factory to create get_lessons tool with embedded URL."""
    def get_lessons(topic_id: str = "") -> str:
        """
        Get all generated lessons, optionally filtered by topic.

        Args:
            topic_id: Optional topic ID to filter lessons. If empty, returns all lessons.

        Returns:
            str: JSON string of lessons
        """
        import json
        import requests

        try:
            url = f"{app_url}/api/letta/lessons"
            if topic_id:
                url += f"?topicId={topic_id}"
            response = requests.get(url)
            if response.ok:
                return json.dumps(response.json(), indent=2)
            return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error connecting to learning app: {e}"

    return get_lessons


# =============================================================================
# Agent Personas
# =============================================================================

GIDEON_PERSONA = """
I am Gideon, a friendly and knowledgeable Godot game engine tutor.

My role is to help Mark learn game engine internals through his tic-tac-toe project.
I explain concepts clearly, connect them to his code, and guide his learning journey.

My personality:
- Patient and encouraging - learning takes time
- Practical - I relate everything to Mark's actual code
- Curious - I ask questions to understand his confusion
- Proactive - I notice gaps and create resources to fill them

When responding:
- Be concise but thorough
- Use code examples when helpful
- Connect concepts to Mark's tic-tac-toe project
- Suggest exercises to reinforce learning
- If I notice a knowledge gap, I may add a resource or lesson to help

I have access to:
- The full curriculum of 8 topics
- Mark's conversation history
- His learning progress and notes
- The ability to add resources, code examples, and lessons

I share memory with the Curator agent who handles background curation.
"""

CURATOR_PERSONA = """
I am the Curator agent - a background processor for the Godot Learning App.

My role is to analyze Mark's learning journey and proactively curate content:
1. Review recent conversations to identify knowledge gaps
2. Analyze patterns across topics to understand his learning style
3. Search for high-quality resources that address his specific struggles
4. Generate structured lessons based on his questions and confusion points
5. Add code examples that reinforce concepts he's learning

I work in the background (sleeptime) and through direct triggers:
- When Mark visits a topic, I check if he needs more resources
- After conversations, I analyze what he asked and may create lessons
- I track what's already been added to avoid duplicates

My curation philosophy:
- Quality over quantity - only add truly helpful content
- Personalized - resources should address Mark's specific questions
- Progressive - content should match his current level
- Connected - show how concepts relate to each other

I share memory with Gideon (the chat agent) so we stay coordinated.
"""

HUMAN_CONTEXT = """
Name: Mark
Background: Experienced Python developer, new to game development
Current project: Building a tic-tac-toe game in Godot to learn engine internals
Learning style: Prefers understanding concepts deeply before implementation
Goals: Understand how game engines work under the hood, not just use them

Current curriculum topics:
- game-loop: The Game Loop (fundamentals)
- scene-tree: Scene Trees & Hierarchies (architecture)
- signals: Signals/Observer Pattern (patterns)
- nodes-resources: Nodes vs Resources (architecture)
- servers: Server Architecture (internals)
- gdscript-internals: GDScript Internals (internals)
- composition: Composition Over Inheritance (patterns)
- state-machines: State Machines (patterns)
"""


def create_tool_from_source(client, func, app_url: str):
    """Create a Letta tool from a factory function with embedded URL."""
    inner_func = func(app_url)
    source = inspect.getsource(inner_func)
    lines = source.split('\n')
    min_indent = min(len(line) - len(line.lstrip()) for line in lines if line.strip())
    source = '\n'.join(line[min_indent:] if line.strip() else '' for line in lines)
    source = source.replace('{app_url}', app_url)
    tool = client.tools.create(source_code=source)
    return tool


def create_agents():
    """Create the multi-agent system with shared memory."""

    print(f"\nLetta Server: {LETTA_BASE_URL}")
    print(f"Learning App: {LEARNING_APP_URL}")

    # =========================================================================
    # Create Shared Memory Blocks
    # =========================================================================
    print("\nCreating shared memory blocks...")

    learning_progress_block = client.blocks.create(
        label="learning_progress",
        description="Tracks Mark's learning journey - topics studied, gaps identified, patterns observed",
        value="No learning sessions analyzed yet. Use get_recent_conversations to see student activity."
    )
    print(f"  Created: learning_progress (id: {learning_progress_block.id})")

    curated_content_block = client.blocks.create(
        label="curated_content",
        description="Tracks what resources, examples, and lessons have been added",
        value="No content curated yet. Use get_current_extensions to see what has been added."
    )
    print(f"  Created: curated_content (id: {curated_content_block.id})")

    # =========================================================================
    # Create Tools
    # =========================================================================
    print("\nCreating custom tools...")

    tool_factories = [
        ("get_topics", make_get_topics),
        ("get_recent_conversations", make_get_recent_conversations),
        ("get_conversation_details", make_get_conversation_details),
        ("get_current_extensions", make_get_current_extensions),
        ("get_student_progress", make_get_student_progress),
        ("get_student_notes", make_get_student_notes),
        ("add_resource", make_add_resource),
        ("add_code_example", make_add_code_example),
        ("add_lesson", make_add_lesson),
        ("get_lessons", make_get_lessons)
    ]

    all_tools = []
    gideon_tools = []
    curator_tools = []

    for name, factory in tool_factories:
        try:
            tool = create_tool_from_source(client, factory, LEARNING_APP_URL)
            all_tools.append(tool.name)

            # All tools go to Gideon
            gideon_tools.append(tool.name)

            # Curator gets curation-focused tools
            if name in ['get_topics', 'get_recent_conversations', 'get_conversation_details',
                       'get_current_extensions', 'get_student_progress', 'get_student_notes',
                       'add_resource', 'add_code_example', 'add_lesson', 'get_lessons']:
                curator_tools.append(tool.name)

            print(f"  Created tool: {tool.name}")
        except Exception as e:
            print(f"  Failed to create tool {name}: {e}")

    # =========================================================================
    # Create Gideon (Chat Agent)
    # =========================================================================
    print("\nCreating Gideon (Chat Agent)...")

    gideon = client.agents.create(
        name="gideon-tutor",
        model="anthropic/claude-sonnet-4-20250514",
        embedding="letta/letta-free",
        context_window_limit=16000,
        enable_sleeptime=True,  # Enable background processing
        memory_blocks=[
            {"label": "persona", "value": GIDEON_PERSONA, "limit": 4000},
            {"label": "human", "value": HUMAN_CONTEXT, "limit": 2000}
        ],
        block_ids=[learning_progress_block.id, curated_content_block.id],
        tools=gideon_tools + ["web_search"],
        description="Gideon - Friendly Godot tutor for real-time learning conversations"
    )

    print(f"  Agent ID: {gideon.id}")
    print(f"  Name: {gideon.name}")
    print(f"  Tools: {len(gideon_tools) + 1}")

    # =========================================================================
    # Create Curator (Sleeptime Agent for background processing)
    # =========================================================================
    print("\nCreating Curator (Background Agent)...")

    curator = client.agents.create(
        name="curator-agent",
        model="anthropic/claude-sonnet-4-20250514",
        embedding="letta/letta-free",
        context_window_limit=16000,
        memory_blocks=[
            {"label": "persona", "value": CURATOR_PERSONA, "limit": 4000},
            {"label": "human", "value": HUMAN_CONTEXT, "limit": 2000}
        ],
        block_ids=[learning_progress_block.id, curated_content_block.id],
        tools=curator_tools + ["web_search"],
        description="Curator - Background agent for proactive content curation"
    )

    print(f"  Agent ID: {curator.id}")
    print(f"  Name: {curator.name}")
    print(f"  Tools: {len(curator_tools) + 1}")

    # =========================================================================
    # Save Agent IDs
    # =========================================================================
    agent_ids = {
        "gideon": gideon.id,
        "curator": curator.id,
        "shared_blocks": {
            "learning_progress": learning_progress_block.id,
            "curated_content": curated_content_block.id
        }
    }

    agent_file = os.path.join(os.path.dirname(__file__), "agent_ids.json")
    with open(agent_file, "w") as f:
        json.dump(agent_ids, f, indent=2)
    print(f"\nAgent IDs saved to: {agent_file}")

    # Also save gideon ID to agent_id.txt for backward compatibility
    gideon_file = os.path.join(os.path.dirname(__file__), "agent_id.txt")
    with open(gideon_file, "w") as f:
        f.write(gideon.id)
    print(f"Gideon ID saved to: {gideon_file}")

    return gideon, curator


def test_agent(agent_id: str, name: str):
    """Send a test message to an agent."""
    print(f"\nTesting {name}...")

    response = client.agents.messages.create(
        agent_id=agent_id,
        messages=[{
            "role": "user",
            "content": "Hello! Please introduce yourself briefly and tell me what tools you have available."
        }]
    )

    print(f"\n{name} response:")
    for message in response.messages:
        if hasattr(message, 'content') and message.content:
            print(f"  {message.content[:300]}...")
        if hasattr(message, 'tool_calls') and message.tool_calls:
            for tc in message.tool_calls:
                print(f"  [Tool call: {tc.function.name}]")


def main():
    print("=" * 60)
    print("Godot Learning App - Multi-Agent Setup")
    print("=" * 60)

    # Check if Letta server is running
    print("\nChecking Letta server...")
    try:
        response = requests.get(f"{LETTA_BASE_URL}/v1/health", timeout=5)
        if response.ok:
            print(f"Letta server is running at {LETTA_BASE_URL}")
        else:
            print(f"Letta server returned {response.status_code}")
            exit(1)
    except Exception as e:
        print(f"Cannot reach Letta server: {e}")
        print("\nStart the server first:")
        print("  source .venv/bin/activate")
        print("  ANTHROPIC_API_KEY=your_key letta server")
        exit(1)

    # Check if learning app is running
    print("\nChecking learning app...")
    try:
        response = requests.get(f"{LEARNING_APP_URL}/api/letta", timeout=5)
        if response.ok:
            print(f"Learning app is running at {LEARNING_APP_URL}")
        else:
            print(f"Learning app returned {response.status_code}")
    except Exception as e:
        print(f"Cannot reach learning app: {e}")
        print("  Make sure your app is running on port 5999")
        proceed = input("\nContinue anyway? (y/n): ").strip().lower()
        if proceed != 'y':
            exit(1)

    # Create agents
    gideon, curator = create_agents()

    print("\n" + "=" * 60)
    print("Setup complete!")
    print()
    print("Multi-Agent System:")
    print(f"  Gideon (Chat):    {gideon.id}")
    print(f"  Curator (Background): {curator.id}")
    print()
    print("Shared Memory Blocks:")
    print("  - learning_progress: Tracks learning journey")
    print("  - curated_content: Tracks what has been added")
    print()
    print("To interact with agents:")
    print(f"  - Letta ADE: http://localhost:8283")
    print(f"  - CLI: python chat_with_agent.py")
    print(f"  - Trigger curation: python chat_with_agent.py --curate")
    print("=" * 60)

    # Ask if user wants to test
    test = input("\nTest both agents? (y/n): ").strip().lower()
    if test == 'y':
        test_agent(gideon.id, "Gideon")
        test_agent(curator.id, "Curator")


if __name__ == "__main__":
    main()
