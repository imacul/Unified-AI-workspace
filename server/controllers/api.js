const { parseJSONBody } = require('../utils/httpUtils');
const memory = require('../services/memoryService');
const providerRouter = require('../services/providerRouter');

async function handleSendMessage(req, res){
  try{
    const { requireAuthOrThrow } = require('../middleware/authMiddleware');
    const metrics = require('../services/metricsService');
    metrics.recordRequest();
    try{ requireAuthOrThrow(req); }catch(e){ res.writeHead(e.status||401, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: e.message })); return; }
    const data = await parseJSONBody(req);
    const text = data.text || '';
    const sessionId = data.sessionId || data.conversationId || 'default';
    const provider = data.provider || 'huggingface';
    const model = data.model || '';
    const stream = data.stream === true;

    // append user message
    await memory.appendMessage(sessionId, { role: 'user', content: text, provider, model, timestamp: Date.now() });

    // build simple context: last 20 messages
    const history = await memory.getSession(sessionId);
    const combinedPrompt = history.slice(-20).map(m => `${m.role}: ${m.content}`).join('\n');

    // call provider router with failover. In production, surface provider errors.
    // For local developer convenience set DEV_FALLBACK=true in .env to return an echo fallback.
    let result, aiText;
    try{
      result = await providerRouter.callProvider(provider, model, combinedPrompt, { fallbacks: [provider, 'huggingface', 'openai'] });
      aiText = result.response || String(result.response || result);
    }catch(err){
      // If developer fallback is enabled, return a safe echo response instead of failing.
      const devFallback = String(process.env.DEV_FALLBACK || 'false').toLowerCase() === 'true';
      if(devFallback){
        console.warn('providerRouter error, DEV_FALLBACK enabled — returning echo:', err && err.message);
        aiText = `You said: ${text}`;
        result = { provider: provider, model };
      }else{
        throw err;
      }
    }

    await memory.appendMessage(sessionId, { role: 'assistant', content: aiText, provider: result.provider, model: result.model, timestamp: Date.now() });

    res.writeHead(200, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
    res.end(JSON.stringify({ message: aiText, provider: result.provider, model: result.model }));
  }catch(err){
    console.error('handleSendMessage err', err);
    res.writeHead(500, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}

async function handleHistory(req,res){
  try{
    const { requireAuthOrThrow } = require('../middleware/authMiddleware');
    try{ requireAuthOrThrow(req); }catch(e){ res.writeHead(e.status||401, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: e.message })); return; }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sid = url.searchParams.get('sessionId') || 'default';
    const data = await memory.getSession(sid);
    res.writeHead(200, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
    res.end(JSON.stringify({ sessionId: sid, messages: data }));
  }catch(err){ res.writeHead(500,{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: String(err) })); }
}

async function handleExport(req,res){
  try{
    const { requireAuthOrThrow } = require('../middleware/authMiddleware');
    try{ requireAuthOrThrow(req); }catch(e){ res.writeHead(e.status||401, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: e.message })); return; }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sid = url.searchParams.get('sessionId') || 'default';
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const messages = await memory.exportSession(sid);

    if(format === 'json'){
      res.writeHead(200, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*', 'Content-Disposition': `attachment; filename="${sid}.json"` });
      res.end(JSON.stringify({ sessionId: sid, messages }));
      return;
    }

    const { toMarkdown, toHTML } = require('../utils/exportUtils');
    if(format === 'md' || format === 'markdown'){
      const md = toMarkdown(sid, messages);
      res.writeHead(200, { 'Content-Type':'text/markdown','Access-Control-Allow-Origin':'*', 'Content-Disposition': `attachment; filename="${sid}.md"` });
      res.end(md);
      return;
    }

    if(format === 'pdf'){
      // Attempt to generate pdf via Playwright if available
      try{
        const playwright = require('playwright');
        const html = toHTML(sid, messages);
        const browser = await playwright.chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${sid}.pdf"` });
        res.end(pdf);
        return;
      }catch(err){
        console.warn('PDF export failed or Playwright not installed', err && err.message);
        res.writeHead(503, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
        res.end(JSON.stringify({ error: 'PDF export not available (Playwright or browsers not installed)' }));
        return;
      }
    }

    res.writeHead(400, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
    res.end(JSON.stringify({ error: 'Unsupported format' }));
  }catch(err){ res.writeHead(500,{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: String(err) })); }
}

async function handleSearch(req,res){
  try{
    const { requireAuthOrThrow } = require('../middleware/authMiddleware');
    try{ requireAuthOrThrow(req); }catch(e){ res.writeHead(e.status||401, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: e.message })); return; }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams.get('q') || '';
    const results = await memory.searchSessions(q);
    res.writeHead(200, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
    res.end(JSON.stringify({ results }));
  }catch(err){ res.writeHead(500,{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: String(err) })); }
}

async function handleAnalytics(req,res){
  try{
    const { requireAuthOrThrow } = require('../middleware/authMiddleware');
    try{ requireAuthOrThrow(req); }catch(e){ res.writeHead(e.status||401, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: e.message })); return; }
    const analytics = require('../services/analyticsService');
    const summary = await analytics.getSummary();
    res.writeHead(200, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
    res.end(JSON.stringify(summary));
  }catch(err){ console.error('handleAnalytics err', err); res.writeHead(500,{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: String(err) })); }
}

module.exports = { handleSendMessage, handleHistory, handleExport, handleSearch, handleAnalytics };
