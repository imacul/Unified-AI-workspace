# AI Unified Workspace - Copilot Instructions

## Project Overview
This is a unified AI chat interface built with **vanilla HTML/CSS/JavaScript** (frontend) and **Node.js/http module** (backend). The application allows users to select from multiple AI providers (ChatGPT, Claude, Gemini) and models, manage chat conversations, and persist state via localStorage.

## Architecture

### Frontend (`index.html` + inline `<script>`)
- **UI Framework**: Vanilla (no React/Vue)
- **Styling**: CSS variables for theme (dark mode), flexbox layout
- **State Management**: `appState` object with:
  - `conversations`: Array of conversation objects (id, title, provider, model, messages, createdAt)
  - `activeConversationId`: Current conversation being viewed
- **Persistence**: `localStorage` with key `"ai_workspace_state"`
- **Key Functions**:
  - `sendMessage()`: Orchestrates message flow - adds user message, calls backend, handles response
  - `render()`: Re-renders conversation list and messages (called after each state change)
  - `newChat()` / `clearChat()`: Conversation management
- **CORS Handling**: Frontend sends POST to `http://localhost:3000/sendmessage`

### Backend (`main.js`)
- **Runtime**: Node.js http module (no Express)
- **Port**: 3000
- **Endpoints**:
  - `POST /sendmessage`: Accepts `{ text }` JSON, returns `{ message: "You said: ..." }`
  - `OPTIONS /sendmessage`: CORS preflight handling
  - All others: 404
- **JSON Parsing**: Manual with try-catch error handling
- **CORS Headers**: Set on all responses to allow frontend requests

## Key Conventions

### Message Objects
```javascript
{ role: "user" | "assistant", content: string, provider?: string, model?: string, timestamp: number }
```
- Role "user" renders right-aligned with `--user-bubble` color
- Role "assistant" renders left-aligned with model tag, `--ai-bubble` color

### Conversation Objects
```javascript
{ id: UUID, title: string, provider: string, model: string, messages: [], createdAt: number }
```
- Title auto-populated from first 30 chars of user's first message
- All messages in a conversation share the same provider/model pair

### Data Flow
1. User types → `sendMessage()` adds user message to conversation
2. UI renders immediately (optimistic update via `render()`)
3. Fetch to backend with `{ text }`
4. Backend echoes response as `{ message: "..." }`
5. Response message appended to conversation
6. State saved to localStorage and re-rendered

## Important Patterns

### localStorage Persistence
- **Key**: `"ai_workspace_state"` 
- **Format**: Full JSON stringification of `appState`
- **Timing**: Called in `saveState()` after state mutations (newChat, clearChat, sendMessage)
- **Don't forget**: Calls to `saveState()` are critical - missing them loses data

### DOM Rendering
- **Approach**: Full re-render on each state change (not incremental)
- **Functions**: `renderConversationList()` and `renderMessages()` clear innerHTML and rebuild
- **Scroll**: Auto-scroll chat to bottom after rendering messages
- **Active state**: History items marked with `.active` class for current conversation

### Provider/Model Selection
- `models` object defines available options per provider (hardcoded)
- Model select updates dynamically when provider changes via `updateModels()`
- Selects are in header; need to re-render message display if changed mid-conversation

## Common Tasks & Implementation Patterns

### Adding a New Conversation Field
- Add to `createConversation()` function
- Include in localStorage save/load (already JSON stringified, no extra work)
- Update `renderConversationList()` if visible to user

### Modifying Message Display
- Edit `renderMessages()` function - controls HTML generation
- Adjust CSS classes `.message.user` and `.message.ai` for styling
- Remember: model tag only shows for assistant messages

### Backend Changes
- All routes must handle CORS (OPTIONS method + headers)
- Response format must be `{ message: "..." }` for frontend to work
- Use `res.end()` not `send()` (vanilla http module)

### Debugging
- Frontend logs to console: "Backend returned:", "Backend request failed"
- Backend logs: "Raw body:", "Parsed:", "JSON parse error"
- Check localStorage in DevTools → Application tab for state inspection

## Critical Notes

- **No build step**: HTML/JS runs directly in browser
- **No module system**: All code is inline or in main.js via Node.js require
- **Cross-origin**: Frontend at file:// or localhost:5000+ calling backend at localhost:3000
- **State loss on reload**: Data persists via localStorage (survives browser close)
- **Duplicate code alert**: `sendMessage()` function appears twice in index.html with slight variations - consolidate if editing

## Running the Application

```bash
node main.js           # Start backend at localhost:3000
# Then open index.html in browser (or run via live server)
```
