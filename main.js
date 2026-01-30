const http = require("http");

const PORT = 3000;

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

                // If provider indicates GPT/OpenAI and API key exists, call OpenAI
                let aiResponse = null;
                try {
                    if ((provider === 'gpt' || provider === 'openai') && process.env.OPENAI_API_KEY) {
                        aiResponse = await callOpenAI(text, model);
                    }
                } catch (err) {
                    console.error('OpenAI call failed:', err);
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
function callOpenAI(text, model="gpt-4o"){
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if(!apiKey) return reject(new Error('OPENAI_API_KEY not set'));

        const postData = JSON.stringify({
            model: model || 'gpt-4o',
            messages: [{ role: 'user', content: text }]
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
