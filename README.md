# AI Unified Workspace

Lightweight unified AI chat backend + vanilla frontend that supports multiple providers, session memory, and streaming.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with your keys (optional for testing):

```
HUGGINGFACE_API_KEY=hf_xxx
OPENAI_API_KEY=sk-xxx
# Optional Redis url
REDIS_URL=redis://localhost:6379
PORT=3000
```

3. Start the server:

```bash
node main.js        # runs on PORT (default 3000)
node dev.js         # starts server on 3001 for dev
```

4. Open `index.html` in a browser (or serve it) to use the frontend.

### Redis (optional but recommended)

The project can use Redis for session storage, rate limiting, and analytics aggregation. For local development you can run a Redis container with the included `docker-compose.yml`.

1. Copy environment variables:

  - Copy `.env.example` to `.env` and update values, especially `REDIS_URL` if non-default.

2. Start Redis with Docker Compose:

```bash
docker compose up -d
# or if your system uses the legacy command:
docker-compose up -d
```

3. Start the app (ensure `.env` contains `REDIS_URL`):

```bash
node dev.js
```

4. Initialize Redis buckets (one-time):

```bash
node server/scripts/setup_redis_buckets.js
```

If you prefer a helper script, run:

```bash
./scripts/start_redis.sh
```

Notes:

- If `REDIS_URL` is not set the app will fall back to file-based storage. Set `REDIS_ONLY=true` in `.env` to force Redis-only mode.
- To enable full Playwright and PDF tests, install Playwright browsers: `npx playwright install`.


## Endpoints

- `POST /sendmessage` — body: `{ text, sessionId?, conversationId?, provider, model, stream? }`.
  - Returns JSON `{ message, provider, model }` for non-streaming calls.
  - Supports streaming SSE for Hugging Face when `stream: true`.
- `GET /health` — health check JSON.

## Session Memory

- Sessions are persisted to `sessions.json` in the project root by default.
- Optionally enable Redis by setting `REDIS_URL`; the app will write/read `sessions` key in Redis while keeping file fallback.

## Frontend

- `index.html` contains a simple chat UI that stores `appState` in `localStorage` and posts to `http://localhost:3000/sendmessage`.
- Streaming SSE is supported and the frontend will append partial deltas; it also attempts a one-time retry if the stream fails.

## Tests

- Unit test: `npm test` (runs `test/test_sendmessage.js`).
- Integration test: `node test/integration_sessions.js` — starts server in-process, posts a message, and checks `sessions.json`.

## Run full test suite (recommended before deploy)

- Unit + integration + extras: `npm run test:all` (this runs multiple test harnesses; `DEV_FALLBACK=true` is used by default in the scripts to allow running without provider keys).

Note: Playwright-dependent tests and PDF export will be skipped or return a 503 unless you run `npx playwright install` to download browsers.

## CI

- A GitHub Actions workflow is included at `.github/workflows/ci.yml` to run unit and integration tests on push/PR.

## Notes & Recommendations

- Provide valid API keys in `.env` to use real model responses.
- For production, run Redis and set `REDIS_URL` to use shared session storage.
- The server has a simple file-backed sessions store; migrate to Redis-only if desired.

If you'd like, I can:
- Convert sessions to Redis-only and remove file fallback.
- Add a small script to serve `index.html` (for easier local browser testing).
- Harden SSE client-side reconnection backoff and cancellation.

Production hardening checklist (recommended):

- Run behind TLS (nginx / load balancer) and enable HTTPS.
- Secure `.env` and secrets via a secret manager (AWS Secret Manager, Vault, etc.).
- Use Redis for session persistence and configure persistence and backups.
- Add authentication and authorization for the API (JWT / OAuth2) before exposing to public.
- Add monitoring/metrics (Prometheus, Grafana) and SLOs for latency/error rates.
- Run the rate limiter in Redis mode for distributed deployments and tune bucket sizes.
- Add unit and e2e tests that use real provider keys in a secure CI environment (not public PRs).
- Consider limiting streaming connections and adding backpressure handling for production traffic.

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
- `OPENAI_API_KEY` — optional. If present and a request uses provider `gpt`, the backend will attempt to call OpenAI.

Developer convenience:

- `DEV_FALLBACK` — set to `true` in your `.env` for local development. When enabled, if provider calls fail (for example, due to missing API keys), the server will return a safe echo response `You said: ...` instead of returning a 5xx error. This is useful for local testing and CI sandboxing; do not enable in production.
- `AUTH_ENABLED` — set to `true` to enforce JWT Bearer token auth on protected API endpoints. Provide `JWT_SECRET` in `.env` and use `npm run gen-token` to create a development token.
- `REDIS_ONLY` — when `true`, sessions will be stored only in Redis (requires `REDIS_URL` to be set). The server exits at startup if `REDIS_ONLY=true` but no `REDIS_URL` is configured.

Example local dev flow:

```bash
cp .env.example .env
# edit .env and set keys; for quick local testing you can enable fallback:
# DEV_FALLBACK=true
npm ci
# run tests with dev fallback enabled (one-off env var):
DEV_FALLBACK=true node test/test_sendmessage.js
```

Metrics:

- The server exposes Prometheus metrics at `/metrics` when `prom-client` is installed. Use this to scrape request and provider latency metrics.

Developer tools & extras:

- Serve the frontend locally:

```bash
npm run serve
# then open http://localhost:5500
```

- Playwright adapter: to run Playwright-based tests and scripts, install browsers:

```bash
# After installing playwright package
npx playwright install
# then run the Playwright (local) test:
node test/test_playwright_adapter.js
```

- Linting: run `npm run lint` to check code style with ESLint and `prettier` is included for formatting.

- Optional error tracking: add `@sentry/node` and set `SENTRY_DSN` to enable Sentry integration (the server will detect and initialize Sentry automatically).
