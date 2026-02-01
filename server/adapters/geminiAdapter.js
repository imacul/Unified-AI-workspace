const https = require('https');
const ProviderBase = require('./providerBase');

class GeminiAdapter extends ProviderBase{
  constructor(){ super('gemini'); }

  async call(prompt, model='text-bison-001'){
    // Support either a bearer token (GEMINI_API_KEY) or a simple API key (GOOGLE_API_KEY)
    const bearer = process.env.GEMINI_API_KEY;
    const apikey = process.env.GOOGLE_API_KEY;
    if(!bearer && !apikey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not set');

    const body = JSON.stringify({
      text: prompt,
      model: model
    });

    // Use the Google Generative Language endpoint (v1beta2) for text generation
    const path = `/v1beta2/models/${encodeURIComponent(model)}:generateText${apikey ? `?key=${encodeURIComponent(apikey)}` : ''}`;

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(bearer ? { 'Authorization': `Bearer ${bearer}` } : {})
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if(res.statusCode && res.statusCode >= 400) return reject(new Error(`Gemini ${res.statusCode}: ${data}`));
            const parsed = JSON.parse(data);
            // try several common shapes returned by Generative Language API
            const candidates = [
              parsed?.candidates?.[0]?.output,
              parsed?.candidates?.[0]?.content,
              parsed?.output?.[0]?.content,
              parsed?.result,
              parsed?.text,
              parsed?.output
            ].filter(Boolean);
            const text = candidates.length ? (typeof candidates[0] === 'string' ? candidates[0] : JSON.stringify(candidates[0])) : null;
            if(text) return resolve(String(text).trim());
            return reject(new Error('No text output in Gemini response'));
          } catch (err) { return reject(err); }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = new GeminiAdapter();
