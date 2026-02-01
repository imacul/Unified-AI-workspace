const https = require('https');
const ProviderBase = require('./providerBase');

class ClaudeAdapter extends ProviderBase{
  constructor(){ super('claude'); }

  async call(prompt, model='claude-2'){
    const key = process.env.CLAUDE_API_KEY;
    if(!key) throw new Error('CLAUDE_API_KEY not set');

    const postData = JSON.stringify({
      model: model,
      prompt: prompt,
      max_tokens: 1000
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/complete',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-api-key': key
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if(res.statusCode && res.statusCode >= 400) return reject(new Error(`Anthropic ${res.statusCode}: ${data}`));
            const parsed = JSON.parse(data);
            // Anthropic responses vary; try several common fields and shapes
            const candidates = [
              parsed?.completion,
              parsed?.completion_text,
              parsed?.output,
              parsed?.output_text,
              parsed?.text,
              parsed?.message?.content,
              parsed?.result
            ].filter(Boolean);
            const text = candidates.length ? (Array.isArray(candidates[0]) ? candidates[0].join('\n') : String(candidates[0])) : null;
            if(text) return resolve(text.trim());
            return reject(new Error('No completion field in Anthropic response'));
          } catch (err) { return reject(err); }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}

module.exports = new ClaudeAdapter();
