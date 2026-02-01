// Simple dev runner to start the server on PORT 3001
process.env.PORT = process.env.PORT || '3001';
require('./main.js');

console.log('Dev server started on port', process.env.PORT);
const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require('https');

const PORT = 3001;

// --- Handle unhandled rejections globally ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

// Load .env manually (no dotenv)
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

const server = http.createServer((req, res) => {
    // Always respond to OPTIONS for CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });
        res.end();
        return;
    }

    if (req.method === "POST" && req.url === "/sendmessage") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            console.log("Raw body received:", body);

            let data;
            try {
                data = JSON.parse(body);
            } catch (err) {
                console.error("JSON parse error:", err, "Raw body:", body);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid JSON", details: err.message }));
                return;
            }

            console.log("Parsed request:", data);

            const text = data.text || "No text sent";
            const provider = (typeof data.provider === 'string' && data.provider) ? data.provider : "unknown";
            const model = (typeof data.model === 'string' && data.model) ? data.model : "unknown";
            const stream = data.stream === true;
            const systemPrompt = "You are the AI assistant for the Unified AI Workspace web app. Respond neutrally.";

            console.log("Provider:", provider, "Model:", model);

            let aiResponse = null;

            try {
                if ((provider === 'gpt' || provider === 'openai')) {
                    if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key missing");
                    aiResponse = await callOpenAI(text, model, systemPrompt);
                } else if (provider === 'huggingface') {
                    if (!process.env.HUGGINGFACE_API_KEY) throw new Error("Hugging Face API key missing");
                    if (stream) {
                        res.writeHead(200, {
                            "Content-Type": "text/event-stream",
                            "Cache-Control": "no-cache",
                            "Connection": "keep-alive",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Headers": "Content-Type"
                        });
                        return callHuggingFaceStream(text, model, systemPrompt, res);
                    } else {
                        aiResponse = await callHuggingFace(text, model, systemPrompt);
                    }
                } else {
                    throw new Error("Unknown provider");
                }
            } catch (err) {
                console.error(`AI call failed for provider ${provider}:`, err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "AI call failed", provider, model, details: err.message }));
                return;
            }

            const responsePayload = { message: aiResponse, provider, model };

            res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type"
            });

            console.log("Responding with:", responsePayload);
            res.end(JSON.stringify(responsePayload));
        });
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
});

server.listen(PORT, () => console.log(`Vanilla backend running at http://localhost:${PORT}`));

// --- OpenAI helper ---
function callOpenAI(text, model="gpt-4o", systemPrompt="") {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return reject(new Error('OPENAI_API_KEY not set'));

        const postData = JSON.stringify({
            model: model || 'gpt-4o',
            messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: text }]
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

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const msg = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || null;
                    if (msg) return resolve(msg);
                    reject(new Error('No message in OpenAI response'));
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// --- Hugging Face helper ---
const HF_DEFAULT_MODEL = "meta-llama/Llama-3.1-8B-Instruct";

function callHuggingFace(text, model = HF_DEFAULT_MODEL, systemPrompt="") {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.HUGGINGFACE_API_KEY;
        if (!apiKey) return reject(new Error('HUGGINGFACE_API_KEY not set'));

        const postData = JSON.stringify({
            model: model || HF_DEFAULT_MODEL,
            messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), { role: "user", content: text }],
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

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode && res.statusCode >= 400) return reject(new Error(`HF ${res.statusCode}: ${data}`));
                    const parsed = JSON.parse(data);
                    const msg = parsed?.choices?.[0]?.message?.content;
                    if (msg) return resolve(msg);
                    if (parsed?.error) return reject(new Error(parsed.error));
                    reject(new Error('No message content in Hugging Face response'));
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function callHuggingFaceStream(text, model = HF_DEFAULT_MODEL, systemPrompt="", res) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
        res.write(`data: ${JSON.stringify({ error: "HUGGINGFACE_API_KEY not set" })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
    }

    const postData = JSON.stringify({
        model: model || HF_DEFAULT_MODEL,
        messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), { role: "user", content: text }],
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

    const req = https.request(options, hfRes => {
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

        hfRes.on('data', chunk => {
            try {
                res.write(`data: ${chunk.toString()}\n\n`);
            } catch (err) {
                console.error('Stream write failed:', err);
            }
        });

        hfRes.on('end', () => res.end());
    });

    req.on('error', err => {
        res.write(`data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
    });

    req.write(postData);
    req.end();
}

