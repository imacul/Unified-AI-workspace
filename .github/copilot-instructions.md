Project Purpose

The AI Unified Workspace is a multi-provider AI chat interface designed for developers and end-users to interact with different AI models (ChatGPT, Hugging Face models, Claude, Gemini, etc.) from a single unified interface. The app supports conversation context, cognitive looping, and session-based memory, enabling follow-up questions and richer interactions without losing context.

Architecture Overview
Frontend (Vanilla HTML/CSS/JS)

UI: Pure HTML + CSS, no React/Vue. CSS variables handle theming (dark/light).

Layout: Flexbox-based chat window with conversation list and active chat panel.

State Management: Single appState object:

appState = {
  conversations: [
    {
      id, title, provider, model,
      messages: [{ role, content, timestamp }],
      createdAt
    }
  ],
  activeConversationId: null
}


Persistence: Stored in localStorage under "ai_workspace_state".

Key Functions:

sendMessage(): Adds user input, calls backend, appends AI response.

newChat() / clearChat(): Manage conversations.

render(): Re-renders conversation list and messages after any update.

Provider & Model Selection:

Hardcoded models object per provider.

Dropdowns update dynamically; changing model mid-conversation preserves messages.

Backend (Node.js / http module)

Runtime: Node.js, vanilla http module, no Express.

Port: 3000 (or 3001 if testing dev.js).

Endpoints:

POST /sendmessage: Accepts { text, provider, model, sessionId }.

OPTIONS /sendmessage: CORS preflight.

All other routes: 404 Not Found.

Environment Variables:

.env file stores keys like HUGGINGFACE_API_KEY or OPENAI_API_KEY.

Cognitive Loop / Session Memory:

Each session (sessionId) stores last N messages (user + AI) in memory.

These messages are sent to AI calls to provide conversation context.

Maintains a sliding window (e.g., last 10-20 messages) to avoid large payloads.

AI Providers:

Hugging Face: Default open-source LLaMA models, supports streaming and non-streaming calls.

OpenAI: GPT models if API key is available.

Error Handling:

JSON parsing with try-catch.

Logs raw requests and responses for debugging.

Graceful fallback if AI call fails: echoes user input.

CORS Headers: Sent on all responses to allow frontend requests.

Cognitive Loop Implementation

In-Memory Session Store:

sessions = { sessionId: [{ role, content }, ...] };


Message Flow:

Frontend sends { text, sessionId, provider, model }.

Backend prepends systemPrompt + session memory.

AI response returned, appended to session memory.

Memory is truncated to last N messages to avoid bloating.

Benefits:

Follow-up questions work naturally.

AI can reference previous messages in the same session.

Supports multiple concurrent sessions/users.

Message & Conversation Objects
Message Object
{ role: "user" | "assistant", content: string, provider?: string, model?: string, timestamp: number }


user messages: Right-aligned bubble.

assistant messages: Left-aligned bubble with model tag.

Conversation Object
{ id: UUID, title: string, provider: string, model: string, messages: [], createdAt: number }


Title auto-generated from first user message (first 30 characters).

Each conversation maintains a provider-model pair.

Data Flow Summary

User types → sendMessage() updates frontend.

Frontend renders optimistically.

POST to backend: { text, sessionId, provider, model }.

Backend:

Prepends session memory.

Calls AI provider.

Stores AI response in session memory.

Response appended to conversation.

Frontend saves updated state to localStorage and re-renders.

Critical Notes

No build step: Vanilla HTML/JS runs in browser.

Backend handles CORS, JSON parsing, AI call errors.

Cognitive loop memory is in-memory, resets on server restart.

Streaming from Hugging Face supported for real-time feedback.

LocalStorage persistence ensures chat history survives page reloads.

important Steps

Finalize dev.js with cognitive loop fully integrated.

Test Hugging Face API calls with open-source LLaMA or similar.

Verify session memory & message flow in frontend.

Must Add persistent storage (Redis / file) for cognitive loop.

UI improvements: auto-scroll, message bubbles, model tags, provider selection.

Error handling: Graceful fallback for AI failure, invalid API keys.

Running the Project
node dev.js            # Start backend at localhost:3001
# Open index.html in browser


Make sure .env exists with HUGGINGFACE_API_KEY (and OPENAI_API_KEY if using OpenAI).

Frontend sends requests to backend for every message, maintaining session memory.