const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// Load .env manually (no dotenv) so HUGGINGFACE_API_KEY is available
function loadEnvFile() {
    try {
        const envPath = path.join(__dirname, ".env");
        if (!fs.existsSync(envPath)) return;
        const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const idx = trimmed.indexOf("=");
            if (idx === -1) continue;
            const key = trimmed.slice(0, idx).trim();
            const value = trimmed.slice(idx + 1).trim();
            if (key && !(key in process.env)) {
                process.env[key] = value;
            }
        }
    } catch (err) {
        console.error("Failed to read .env:", err);
    }
}

loadEnvFile();

// Production sanity checks
const devFallback = String(process.env.DEV_FALLBACK || 'false').toLowerCase() === 'true';
const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
function ensureProviderKeysOrExit(){
    if(devFallback) return;
    // require at least one provider key
    if(!process.env.OPENAI_API_KEY && !process.env.HUGGINGFACE_API_KEY && !process.env.CLAUDE_API_KEY && !process.env.GEMINI_API_KEY){
        console.error('No provider API keys configured. Set OPENAI_API_KEY, HUGGINGFACE_API_KEY, CLAUDE_API_KEY or GEMINI_API_KEY, or enable DEV_FALLBACK=true for development. Exiting.');
        process.exit(1);
    }
}
// Only enforce in production mode (or when DEV_FALLBACK is false and explicitly running)
if(nodeEnv === 'production' || !devFallback){
    ensureProviderKeysOrExit();
}

// If auth is enabled, ensure a non-default JWT secret is provided
const authEnabled = String(process.env.AUTH_ENABLED || 'false').toLowerCase() === 'true';
if(authEnabled){
    const jwtSecret = process.env.JWT_SECRET || '';
    if(!jwtSecret || jwtSecret === 'dev-secret-change-me'){
        console.error('AUTH_ENABLED is true but JWT_SECRET is not set or uses the default. Set JWT_SECRET to a strong secret. Exiting.');
        process.exit(1);
    }
}

// --- Session persistence (file-backed store with optional Redis backing) ---
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
let sessions = {};
let useRedis = false;
let redisClient = null;

function initRedisIfConfigured() {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS;
    const redisOnly = String(process.env.REDIS_ONLY || 'false').toLowerCase() === 'true';
    if (redisOnly && !redisUrl) {
        console.error('REDIS_ONLY is set but REDIS_URL is not configured. Exiting.');
        process.exit(1);
    }
    if (!redisUrl) return;
    try {
        const { createClient } = require('redis');
        redisClient = createClient({ url: redisUrl });
        redisClient.on('error', (err) => console.error('Redis error:', err));
        redisClient.connect().then(() => {
            useRedis = true;
            // attempt to load sessions from redis key
            redisClient.get('sessions').then(raw => {
                if (raw) {
                    try { sessions = JSON.parse(raw) || {}; } catch (e) { sessions = {}; }
                }
            }).catch(err => console.error('Failed to read sessions from redis:', err));
        }).catch(err => console.error('Failed to connect to redis:', err));
    } catch (e) {
        console.error('Redis library not available or failed to initialize:', e.message || e);
        useRedis = false;
    }
}

function loadSessions() {
    try {
        if (!fs.existsSync(SESSIONS_FILE)) return;
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
        sessions = JSON.parse(raw) || {};
    } catch (err) {
        console.error('Failed to load sessions:', err);
        sessions = {};
    }
}

function saveSessions() {
    try {
        if (useRedis && redisClient) {
            // persist asynchronously to redis
            redisClient.set('sessions', JSON.stringify(sessions)).catch(err => console.error('Failed to save sessions to redis:', err));
        }
        const redisOnly = String(process.env.REDIS_ONLY || 'false').toLowerCase() === 'true';
        if(!redisOnly){
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
        }
    } catch (err) {
        console.error('Failed to save sessions:', err);
    }
}

function appendSessionMessage(sessionId, role, content, provider, model) {
    if (!sessionId) sessionId = 'default';
    sessions[sessionId] = sessions[sessionId] || [];
    sessions[sessionId].push({ role, content, provider, model, timestamp: Date.now() });
    // keep last 40 entries to limit file size
    if (sessions[sessionId].length > 40) sessions[sessionId] = sessions[sessionId].slice(-40);
    saveSessions();
}

initRedisIfConfigured();
loadSessions();

// wire memory service to redis client if available
try{
    const memory = require('./server/services/memoryService');
    if(useRedis && redisClient){ memory.init(redisClient); }
}catch(e){ /* ignore */ }

// initialize summarizer (periodic cognitive loop)
try{
    const summarizer = require('./server/services/summarizer');
    summarizer.init({ redis: (useRedis ? redisClient : null), intervalMs: Number(process.env.SUMMARY_INTERVAL_MS || 10*60*1000) });
}catch(e){ console.error('Failed to init summarizer', e); }

// initialize rate limiter service
try{
    const rateLimiter = require('./server/services/rateLimiter');
    if(useRedis && redisClient) rateLimiter.init(redisClient);
}catch(e){ console.error('Failed to init rateLimiter', e); }

// wire provider helpers to be usable by services
// (main_helpers already exports helpers used by providerRouter)
const helpers = require('./main_helpers');
// wire redis client to shared state for other services
try{
    const state = require('./server/services/state');
    if(redisClient) state.setRedisClient(redisClient);
}catch(e){}

const server = http.createServer(async (req, res) => {
    // Always respond to OPTIONS for CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
    }

    // Health check
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/health') {
        const payload = { status: 'ok', pid: process.pid, sessions: Object.keys(sessions).length, redis: !!(redisClient && useRedis) };
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(payload));
        return;
    }

    // Metrics endpoint (Prometheus)
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/metrics') {
        try{
            const metrics = require('./server/services/metricsService');
            return metrics.metricsHandler(req, res);
        }catch(e){
            res.writeHead(500, { 'Content-Type':'text/plain' });
            res.end('Metrics handler error');
            return;
        }
    }

    if (req.method === "POST" && req.url === "/sendmessage") {
        // delegate to modular API controller
        try{
            const api = require('./server/controllers/api');
            return api.handleSendMessage(req, res);
        }catch(e){
            console.error('Failed to load API controller', e);
            res.writeHead(500, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
            res.end(JSON.stringify({ error: 'Server error' }));
            return;
        }
    }

    // Auth token exchange
    if (req.method === 'POST' && req.url === '/auth/token'){
        try{
            const auth = require('./server/controllers/auth');
            return auth.handleToken(req,res);
        }catch(e){ console.error('Auth controller error', e); res.writeHead(500,{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: 'Auth error' })); return; }
    }

    // history/export/search endpoints
    if ((req.method === 'GET' || req.method === 'POST') && req.url && (req.url.startsWith('/history') || req.url.startsWith('/export') || req.url.startsWith('/search') || req.url.startsWith('/analytics'))){
        try{
            const api = require('./server/controllers/api');
            if(req.url.startsWith('/history')) return api.handleHistory(req,res);
            if(req.url.startsWith('/export')) return api.handleExport(req,res);
            if(req.url.startsWith('/search')) return api.handleSearch(req,res);
            if(req.url.startsWith('/analytics')) return api.handleAnalytics(req,res);
            return;
        }catch(e){ console.error('API controller load error', e); }
    }

    // Summary endpoint: GET /summary?sessionId=... or GET /summary/<sessionId>
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url && req.url.startsWith('/summary')){
        try{
            const summarizer = require('./server/services/summarizer');
            // parse sessionId from query or path
            let sessionId = null;
            try{
                const full = new URL(req.url, `http://localhost:${PORT}`);
                sessionId = full.searchParams.get('sessionId');
            }catch(e){ /* ignore */ }
            if(!sessionId){
                const parts = req.url.split('/').filter(Boolean);
                if(parts.length >= 2) sessionId = parts[1];
            }
            if(!sessionId){
                res.writeHead(400, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
                res.end(JSON.stringify({ error: 'sessionId required (query param or /summary/<id>)' }));
                return;
            }
            const s = await summarizer.getSummary(sessionId);
            res.writeHead(200, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
            res.end(JSON.stringify({ sessionId, summary: s }));
            return;
        }catch(e){ console.error('summary endpoint error', e); res.writeHead(500, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error: String(e) })); return; }
    }

    // JSON metrics for dashboard
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/metrics.json'){
        try{
            const metrics = require('./server/services/metricsService');
            const data = await metrics.metricsJSON();
            res.writeHead(200, { 'Content-Type': 'application/json','Access-Control-Allow-Origin':'*' });
            res.end(JSON.stringify(data));
            return;
        }catch(e){ res.writeHead(500, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: String(e) })); return; }
    }

    // Serve analytics dashboard static page
    if (req.method === 'GET' && req.url === '/analytics.html'){
        try{
            const fpath = path.join(__dirname, 'analytics.html');
            if(fs.existsSync(fpath)){
                const content = fs.readFileSync(fpath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
                return;
            }
        }catch(e){ /* fallthrough */ }
    }

    // Dev-only: toggle Hugging Face simulated failure for testing failover
    if (req.method === 'POST' && req.url === '/dev/fail/hf'){
        // only allow in dev fallback mode
        if(!devFallback){ res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'Dev toggle only allowed when DEV_FALLBACK=true' })); return; }
        try{
            let body = '';
            req.on('data', c=> body += c.toString());
            req.on('end', ()=>{
                try{
                    const payload = body ? JSON.parse(body) : {};
                    const enabled = payload.enabled === true;
                    // require the adapter module and set the flag
                    try{
                        const hf = require('./server/adapters/huggingfaceAdapter');
                        if(typeof hf.setForceFail === 'function') hf.setForceFail(enabled);
                    }catch(e){ /* ignore if not present */ }
                    res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
                    res.end(JSON.stringify({ success:true, enabled }));
                }catch(e){ res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'invalid body' })); }
            });
            return;
        }catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: String(e) })); return; }
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
});

server.listen(PORT, () => console.log(`Vanilla backend running at http://localhost:${PORT}`));

// health endpoint: quick liveness check
// (we also handle it above for other methods; add a lightweight route)

async function gracefulShutdown(signal){
    console.log(`${signal} received. Shutting down, saving sessions...`);
    try{
        // persist sessions to redis if configured
        if(useRedis && redisClient){
            try{ await redisClient.set('sessions', JSON.stringify(sessions)); }catch(e){ console.error('Failed to persist sessions to redis on shutdown', e); }
            try{ await redisClient.quit(); }catch(e){ try{ await redisClient.disconnect(); }catch(_){} }
        }
        // write local file if allowed
        saveSessions();
    }catch(e){ console.error('Error during shutdown persistence', e); }
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// --- OpenAI helper ---
const https = require('https');
function callOpenAI(text, model="gpt-4o", systemPrompt=""){
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if(!apiKey) return reject(new Error('OPENAI_API_KEY not set'));

        // We send the combined prompt as a single user message so older or simpler wrappers work
        const postData = JSON.stringify({
            model: model || 'gpt-4o',
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: text }
            ]
        });

        const options = {
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': `Bearer ${apiKey}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try{
                    const parsed = JSON.parse(data);
                    // Attempt to extract message text
                    const msg = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || null;
                    if(msg) return resolve(msg);
                    return reject(new Error('No message in OpenAI response'));
                }catch(err){
                    return reject(err);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// --- Hugging Face helper (router OpenAI-compatible) ---
const HF_DEFAULT_MODEL = "meta-llama/Llama-3.1-8B-Instruct";

function callHuggingFace(text, model = HF_DEFAULT_MODEL, systemPrompt="") {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.HUGGINGFACE_API_KEY;
        if (!apiKey) return reject(new Error('HUGGINGFACE_API_KEY not set'));

        const makeRequest = (modelToUse) => {
            const postData = JSON.stringify({
                model: modelToUse,
                messages: [
                    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                    { role: "user", content: text }
                ],
                stream: false
            });

            const options = {
                hostname: 'router.huggingface.co',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'Authorization': `Bearer ${apiKey}`
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            return reject(new Error(`HF ${res.statusCode}: ${data}`));
                        }
                        const parsed = JSON.parse(data);
                        const msg = parsed?.choices?.[0]?.message?.content;
                        if (msg) return resolve(msg);
                        if (parsed?.error) return reject(new Error(parsed.error));
                        return reject(new Error('No message content in Hugging Face response'));
                    } catch (err) {
                        return reject(err);
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        };

        makeRequest(model || HF_DEFAULT_MODEL);
    });
}

function callHuggingFaceStream(text, model = HF_DEFAULT_MODEL, systemPrompt="", res, sessionId) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
        res.write(`data: ${JSON.stringify({ error: "HUGGINGFACE_API_KEY not set" })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
    }

    const postData = JSON.stringify({
        model: model || HF_DEFAULT_MODEL,
        messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: text }
        ],
        stream: true
    });

    const options = {
        hostname: 'router.huggingface.co',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Authorization': `Bearer ${apiKey}`
        }
    };

    const req = https.request(options, (hfRes) => {
        if (hfRes.statusCode && hfRes.statusCode >= 400) {
            let errData = '';
            hfRes.on('data', chunk => errData += chunk);
            hfRes.on('end', () => {
                res.write(`data: ${JSON.stringify({ error: `HF ${hfRes.statusCode}: ${errData}` })}\n\n`);
                res.write("data: [DONE]\n\n");
                res.end();
            });
            return;
        }

        // Parse SSE-like stream from HF router and extract content deltas
        let buffer = '';
        let collected = '';
        hfRes.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const parts = buffer.split('\n');
            buffer = parts.pop() || '';
            for (const rawLine of parts) {
                const line = rawLine.trim();
                if (!line) continue;
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (payload === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(payload);
                    const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content || '';
                    if (delta) {
                        collected += delta;
                        // forward a compact SSE chunk to the client
                        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                    }
                } catch (e) {
                    // If parsing fails, forward raw line
                    res.write(`data: ${JSON.stringify({ raw: payload })}\n\n`);
                }
            }
        });

        hfRes.on('end', () => {
            // persist collected assistant text (best-effort)
            appendSessionMessage(sessionId, 'assistant', collected || buffer || '', 'huggingface', model);
            res.write("data: [DONE]\n\n");
            res.end();
        });
    });

    req.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
    });

    req.write(postData);
    req.end();
}
