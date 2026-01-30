# AI Unified Workspace — Run & Test

Start backend:
```bash
node main.js
```

Run the test harness (makes a POST to `/sendmessage`):
```bash
npm test
```

Open `index.html` in a browser or use Live Server at `http://localhost:5500` to use the frontend.

Environment variables:
- `OPENAI_API_KEY` — optional. If present and a request uses provider `gpt`, the backend will attempt to call OpenAI. If absent, the backend falls back to echoing the message.
