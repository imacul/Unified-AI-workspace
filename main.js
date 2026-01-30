const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3001;

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
            console.log("Raw body:", body);

            try {
                const data = JSON.parse(body);
                console.log("Parsed request:", data);

                const text = data.text || "No text sent";
                const provider = (typeof data.provider === 'string' && data.provider) ? data.provider : "unknown";
                const model = (typeof data.model === 'string' && data.model) ? data.model : "unknown";
                const stream = data.stream === true;
                const systemPrompt = "You are the AI assistant for the Unified AI Workspace web app. You cannot verify a user's claims about contributing to this site; respond neutrally and avoid stating they did or did not contribute unless they provide evidence.";

                console.log("Provider:", provider, "Model:", model, "Has HF key:", !!process.env.HUGGINGFACE_API_KEY);
                // If provider indicates GPT/OpenAI and API key exists, call OpenAI
                let aiResponse = null;
                try {
                    if ((provider === 'gpt' || provider === 'openai') && process.env.OPENAI_API_KEY) {
                        aiResponse = await callOpenAI(text, model, systemPrompt);
                    }
                    if (provider === 'huggingface' && process.env.HUGGINGFACE_API_KEY && stream) {
                        res.writeHead(200, {
                            "Content-Type": "text/event-stream",
                            "Cache-Control": "no-cache",
                            "Connection": "keep-alive",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Headers": "Content-Type"
                        });
                        return callHuggingFaceStream(text, model, systemPrompt, res);
                    }
                    if (provider === 'huggingface' && process.env.HUGGINGFACE_API_KEY) {
                        aiResponse = await callHuggingFace(text, model, systemPrompt);
                    }
                } catch (err) {
                    console.error('AI call failed:', err);
                    aiResponse = null;
                }

                // Fallback to echo if no aiResponse
                if (!aiResponse) aiResponse = `You said: ${text}`;

                const responsePayload = { message: aiResponse, provider, model };

                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type"
                });

                console.log("Responding with:", responsePayload);
                res.end(JSON.stringify(responsePayload));

            } catch (err) {
                console.error("JSON parse error:", err);
                res.writeHead(400, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type"
                });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
});

server.listen(PORT, () => console.log(`Vanilla backend running at http://localhost:${PORT}`));

// --- OpenAI helper ---
const https = require('https');
function callOpenAI(text, model="gpt-4o", systemPrompt=""){
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if(!apiKey) return reject(new Error('OPENAI_API_KEY not set'));

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

        hfRes.on('data', (chunk) => {
            res.write(chunk);
        });
        hfRes.on('end', () => {
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
