"""
Letta tool definitions for the Godot Learning App.
All tools read LEARNING_APP_URL from environment at runtime - no hardcoded URLs.

Each function must be self-contained with imports inside.
"""

def get_topics() -> str:
    """
    Get all available topics in the Godot learning curriculum.
    Returns a list of topics with their IDs, titles, and descriptions.
    Use this to understand what topics exist before adding resources.

    Returns:
        str: JSON string of topics with id, title, category, and description
    """
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
    try:
        response = requests.get(f"{app_url}/api/letta?action=topics")
        if response.ok:
            return json.dumps(response.json(), indent=2)
        return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error connecting to learning app at {app_url}: {e}"


def get_recent_conversations() -> str:
    """
    Get summaries of recent chat conversations from the learning notebooks.
    Use this to understand what the student has been studying and asking about.
    Returns notebook metadata including topic IDs and message counts.

    Returns:
        str: JSON string of notebooks with topic_id, title, message_count, last_updated
    """
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
    try:
        response = requests.get(f"{app_url}/api/letta?action=notebooks")
        if response.ok:
            return json.dumps(response.json(), indent=2)
        return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error connecting to learning app at {app_url}: {e}"


def get_conversation_details(topic_id: str) -> str:
    """
    Get the full conversation history for a specific topic.
    Use this to analyze what questions the student asked and what they're struggling with.

    Args:
        topic_id: The ID of the topic (e.g., 'game-loop', 'signals', 'scene-tree')

    Returns:
        str: JSON string of conversation messages for that topic
    """
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
    try:
        response = requests.get(f"{app_url}/api/letta?action=notebook&topicId={topic_id}")
        if response.ok:
            return json.dumps(response.json(), indent=2)
        return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error connecting to learning app at {app_url}: {e}"


def get_current_extensions() -> str:
    """
    Get all resources and code examples that have been dynamically added.
    Use this to see what content has already been curated to avoid duplicates.

    Returns:
        str: JSON string of all dynamically added resources and code examples
    """
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
    try:
        response = requests.get(f"{app_url}/api/letta?action=extensions")
        if response.ok:
            return json.dumps(response.json(), indent=2)
        return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error connecting to learning app at {app_url}: {e}"


def get_student_progress() -> str:
    """
    Get the student's learning progress across all topics.
    Shows which topics are completed, exercises done, and last visit times.
    Use this to understand the student's learning journey and identify focus areas.

    Returns:
        str: JSON string of progress data per topic
    """
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
    try:
        response = requests.get(f"{app_url}/api/progress")
        if response.ok:
            return json.dumps(response.json(), indent=2)
        return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error connecting to learning app at {app_url}: {e}"


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
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
    try:
        response = requests.get(f"{app_url}/api/progress")
        if response.ok:
            data = response.json()
            topic_progress = data.get('topics', {}).get(topic_id, {})
            notes = topic_progress.get('notes', '')
            return json.dumps({
                'topicId': topic_id,
                'notes': notes,
                'hasNotes': bool(notes.strip()) if notes else False
            }, indent=2)
        return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error connecting to learning app at {app_url}: {e}"


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
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
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
        return f"Error connecting to learning app at {app_url}: {e}"


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
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
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
        return f"Error connecting to learning app at {app_url}: {e}"


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
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
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


def get_lessons(topic_id: str = "") -> str:
    """
    Get all generated lessons, optionally filtered by topic.

    Args:
        topic_id: Optional topic ID to filter lessons. If empty, returns all lessons.

    Returns:
        str: JSON string of lessons
    """
    import os
    import json
    import requests

    app_url = os.getenv("LEARNING_APP_URL", "http://localhost:5173")
    try:
        url = f"{app_url}/api/letta/lessons"
        if topic_id:
            url += f"?topicId={topic_id}"
        response = requests.get(url)
        if response.ok:
            return json.dumps(response.json(), indent=2)
        return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error connecting to learning app at {app_url}: {e}"


# All tools list for easy importing
ALL_TOOLS = [
    get_topics,
    get_recent_conversations,
    get_conversation_details,
    get_current_extensions,
    get_student_progress,
    get_student_notes,
    add_resource,
    add_code_example,
    add_lesson,
    get_lessons,
]
