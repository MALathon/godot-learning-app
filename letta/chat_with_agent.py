#!/usr/bin/env python3
"""
Chat with the Godot Learning Curator Agent

This script lets you interact with your Letta agent to:
- Trigger resource curation
- Ask it to analyze conversations
- Have it find specific resources

Usage:
    python chat_with_agent.py
    python chat_with_agent.py --curate  # Trigger a curation session
"""

import os
import sys
from letta_client import Letta

LETTA_BASE_URL = os.getenv("LETTA_BASE_URL", "http://localhost:8283")

# Connect to local Letta server
client = Letta(base_url=LETTA_BASE_URL)

# Load agent ID
agent_file = os.path.join(os.path.dirname(__file__), "agent_id.txt")
if not os.path.exists(agent_file):
    print("ERROR: Agent not found. Run setup_agent.py first.")
    exit(1)

with open(agent_file) as f:
    AGENT_ID = f.read().strip()

print(f"Connected to agent: {AGENT_ID}")
print("-" * 50)


def send_message(content: str):
    """Send a message and print the response."""
    response = client.agents.messages.create(
        agent_id=AGENT_ID,
        messages=[{"role": "user", "content": content}]
    )

    for message in response.messages:
        if hasattr(message, 'reasoning') and message.reasoning:
            print(f"\n[Thinking]: {message.reasoning[:200]}...")
        if hasattr(message, 'content') and message.content:
            print(f"\n[Agent]: {message.content}")
        if hasattr(message, 'tool_calls') and message.tool_calls:
            for tc in message.tool_calls:
                print(f"\n[Tool: {tc.function.name}]")
                if hasattr(tc.function, 'arguments'):
                    args = tc.function.arguments
                    if len(str(args)) > 100:
                        print(f"  Args: {str(args)[:100]}...")
                    else:
                        print(f"  Args: {args}")


def curate():
    """Trigger a curation session."""
    print("\nTriggering curation session...")
    send_message("""
    Please perform a curation session:
    1. Check get_recent_conversations to see which topics have activity
    2. For active topics, use get_conversation_details to understand what the student asked
    3. Use get_current_extensions to see what's already been added
    4. Based on the conversations, find and add 2-3 relevant resources using web_search and add_resource
    5. If you see code questions, consider adding a helpful code example with add_code_example

    Focus on topics with recent activity. Prioritize official Godot docs, GDQuest tutorials, and Game Programming Patterns.
    """)


def interactive():
    """Interactive chat mode."""
    print("\nInteractive mode. Type 'quit' to exit, 'curate' to trigger curation.")
    print("-" * 50)

    while True:
        try:
            user_input = input("\nYou: ").strip()
            if not user_input:
                continue
            if user_input.lower() == 'quit':
                break
            if user_input.lower() == 'curate':
                curate()
                continue
            send_message(user_input)
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break


def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == '--curate':
            curate()
        else:
            # Send single message
            send_message(' '.join(sys.argv[1:]))
    else:
        interactive()


if __name__ == "__main__":
    main()
