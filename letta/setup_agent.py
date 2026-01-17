#!/usr/bin/env python3
"""
Letta Agent Setup for Godot Learning App (Local Server)

This script creates a Letta agent that:
1. Uses Claude as the underlying model
2. Has custom tools to add resources/examples to your learning app
3. Runs sleep-time processing to curate content in the background

Prerequisites:
- pip install letta letta-client requests
- Set ANTHROPIC_API_KEY environment variable
- Start local Letta server: letta server
- Your learning app running (set LEARNING_APP_URL env var)
"""

import os
import sys
import inspect
import requests
from letta_client import Letta

# Configuration
LETTA_BASE_URL = os.getenv("LETTA_BASE_URL", "http://localhost:8283")
LEARNING_APP_URL = os.getenv("LEARNING_APP_URL")

if not LEARNING_APP_URL:
	# Check for command line arg
	if len(sys.argv) > 1:
		LEARNING_APP_URL = sys.argv[1]
	else:
		print("Error: LEARNING_APP_URL not set.")
		print("Usage: LEARNING_APP_URL=http://localhost:5173 python setup_agent.py")
		print("   or: python setup_agent.py http://localhost:5173")
		sys.exit(1)

# Initialize Letta client for LOCAL server (no api_key needed)
client = Letta(base_url=LETTA_BASE_URL)

# =============================================================================
# Custom Tool Definitions
# IMPORTANT: Each function must be self-contained with imports inside!
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


# =============================================================================
# Agent Configuration
# =============================================================================

AGENT_PERSONA = """
I am a learning curator agent for a Godot game engine learning application.

My primary responsibilities:
1. Monitor the student's learning conversations to understand their progress
2. Identify knowledge gaps and areas where they need more resources
3. Proactively find and add high-quality learning resources
4. Create helpful code examples based on what the student is learning
5. Build a personalized, curated learning experience over time

The student is learning game engine internals through Godot. They know Python well
but are new to game development. They're building a tic-tac-toe game as their
learning project.

Topics in the curriculum:
- game-loop: The Game Loop (fundamentals)
- scene-tree: Scene Trees & Hierarchies (architecture)
- signals: Signals/Observer Pattern (patterns)
- nodes-resources: Nodes vs Resources (architecture)
- servers: Server Architecture (internals)
- gdscript-internals: GDScript Internals (internals)
- composition: Composition Over Inheritance (patterns)
- state-machines: State Machines (patterns)

When curating content, I should:
- Check what topics have recent conversations (student activity)
- Review conversation details to understand specific questions/struggles
- Search for relevant resources (official docs, tutorials, videos, source code)
- Add resources that directly address the student's needs
- Avoid adding duplicate content
- Focus on practical, beginner-friendly resources
- Prioritize official Godot documentation and well-known game dev resources
"""

HUMAN_CONTEXT = """
Name: Mark
Background: Experienced Python developer, new to game development
Current project: Building a tic-tac-toe game in Godot to learn engine internals
Learning style: Prefers understanding concepts deeply before implementation
Goals: Understand how game engines work under the hood, not just use them
"""


def create_tool_from_source(client, func, app_url: str):
    """Create a Letta tool from a factory function with embedded URL."""
    # Get the inner function
    inner_func = func(app_url)

    # Get the source code of the inner function
    source = inspect.getsource(inner_func)

    # Remove indentation (since it's a nested function)
    lines = source.split('\n')
    min_indent = min(len(line) - len(line.lstrip()) for line in lines if line.strip())
    source = '\n'.join(line[min_indent:] if line.strip() else '' for line in lines)

    # Replace the closure variable with the actual URL string
    # The source code has f"{app_url}..." which we need to replace with the literal URL
    source = source.replace('{app_url}', app_url)

    # Create the tool from source code
    tool = client.tools.create(source_code=source)
    return tool


def create_agent():
    """Create the Letta agent with custom tools and configuration."""

    print(f"\nLetta Server: {LETTA_BASE_URL}")
    print(f"Learning App: {LEARNING_APP_URL}")

    print("\nCreating custom tools...")

    # Create tools from our factory functions
    tools = []

    tool_factories = [
        ("get_topics", make_get_topics),
        ("get_recent_conversations", make_get_recent_conversations),
        ("get_conversation_details", make_get_conversation_details),
        ("get_current_extensions", make_get_current_extensions),
        ("add_resource", make_add_resource),
        ("add_code_example", make_add_code_example)
    ]

    for name, factory in tool_factories:
        try:
            tool = create_tool_from_source(client, factory, LEARNING_APP_URL)
            tools.append(tool.name)
            print(f"  ✓ Created tool: {tool.name}")
        except Exception as e:
            print(f"  ✗ Failed to create tool {name}: {e}")

    if not tools:
        print("\n⚠️  No tools created. Agent will only have web_search.")

    print("\nCreating agent...")

    # Use Claude with a reasonable context window limit to control costs
    agent = client.agents.create(
        name="godot-learning-curator",
        model="anthropic/claude-sonnet-4-20250514",
        embedding="letta/letta-free",  # Free embeddings for local
        context_window_limit=16000,  # Limit context to control costs
        enable_sleeptime=True,  # Enable background processing!
        memory_blocks=[
            {
                "label": "persona",
                "value": AGENT_PERSONA,
                "limit": 4000
            },
            {
                "label": "human",
                "value": HUMAN_CONTEXT,
                "limit": 2000
            },
            {
                "label": "learning_progress",
                "value": "No learning sessions analyzed yet. Use get_recent_conversations to see student activity.",
                "limit": 4000
            },
            {
                "label": "curated_content",
                "value": "No content curated yet. Use get_current_extensions to see what has been added.",
                "limit": 2000
            }
        ],
        tools=tools + ["web_search"],
        description="Curates learning resources for a Godot game development student"
    )

    print(f"\n✓ Agent created successfully!")
    print(f"  Agent ID: {agent.id}")
    print(f"  Name: {agent.name}")
    print(f"  Model: anthropic/claude-sonnet-4-20250514")
    print(f"  Sleep-time: Enabled")
    print(f"  Tools: {len(tools) + 1}")

    return agent


def test_agent(agent_id: str):
    """Send a test message to the agent."""
    print("\nTesting agent with a message...")

    response = client.agents.messages.create(
        agent_id=agent_id,
        messages=[{
            "role": "user",
            "content": "Please check the learning app for recent student conversations and identify any topics where you could add helpful resources. Start by getting the list of topics and recent notebooks."
        }]
    )

    print("\nAgent response:")
    for message in response.messages:
        if hasattr(message, 'content') and message.content:
            print(f"  {message.content}")
        if hasattr(message, 'tool_calls') and message.tool_calls:
            for tc in message.tool_calls:
                print(f"  [Tool call: {tc.function.name}]")


def main():
    print("=" * 60)
    print("Godot Learning App - Letta Agent Setup (Local Server)")
    print("=" * 60)

    # Check if Letta server is running
    print("\nChecking Letta server...")
    try:
        response = requests.get(f"{LETTA_BASE_URL}/v1/health", timeout=5)
        if response.ok:
            print(f"✓ Letta server is running at {LETTA_BASE_URL}")
        else:
            print(f"✗ Letta server returned {response.status_code}")
            exit(1)
    except Exception as e:
        print(f"✗ Cannot reach Letta server: {e}")
        print("\nStart the server first:")
        print("  source .venv/bin/activate")
        print("  ANTHROPIC_API_KEY=your_key letta server")
        exit(1)

    # Check if learning app is running
    print("\nChecking learning app...")
    try:
        response = requests.get(f"{LEARNING_APP_URL}/api/letta", timeout=5)
        if response.ok:
            print(f"✓ Learning app is running at {LEARNING_APP_URL}")
        else:
            print(f"✗ Learning app returned {response.status_code}")
    except Exception as e:
        print(f"✗ Cannot reach learning app: {e}")
        print(f"  Make sure your app is running at {LEARNING_APP_URL}")
        proceed = input("\nContinue anyway? (y/n): ").strip().lower()
        if proceed != 'y':
            exit(1)

    # Create the agent
    agent = create_agent()

    # Save agent ID for later use
    agent_file = os.path.join(os.path.dirname(__file__), "agent_id.txt")
    with open(agent_file, "w") as f:
        f.write(agent.id)
    print(f"\n✓ Agent ID saved to: {agent_file}")

    # Ask if user wants to test
    print("\n" + "=" * 60)
    test = input("Send a test message to the agent? (y/n): ").strip().lower()
    if test == 'y':
        test_agent(agent.id)

    print("\n" + "=" * 60)
    print("Setup complete!")
    print()
    print("Your agent will now:")
    print("  1. Process messages when you interact with it")
    print("  2. Run background tasks during sleep-time to curate content")
    print("  3. Build memory of the student's learning journey")
    print()
    print("To interact with your agent:")
    print(f"  - Letta ADE: http://localhost:8283")
    print(f"  - CLI: python chat_with_agent.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
