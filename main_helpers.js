const https = require('https');

// --- OpenAI helper ---
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

function callHuggingFaceStream(text, model = HF_DEFAULT_MODEL, systemPrompt="", res, sessionId, onDelta){
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

        // Parse SSE-like stream
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
                        if(onDelta) onDelta(delta);
                        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                    }
                } catch (e) {
                    res.write(`data: ${JSON.stringify({ raw: payload })}\n\n`);
                }
            }
        });

        hfRes.on('end', () => {
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

module.exports = { callOpenAI, callHuggingFace, callHuggingFaceStream };
