const adapters = require('../adapters');
const rateLimiter = require('./rateLimiter');
const analytics = require('../analyticsService');
const queue = require('./queueScheduler');

// Try a single provider with queueing and rate-limiter
async function tryProviderOnce(p, model, prompt, opts={}){
  const adapter = adapters.getAdapter(p);
  if(!adapter) throw new Error('Unknown adapter: ' + p);
  if(opts.stream && typeof adapter.stream === 'function'){
    throw new Error('Stream requested: caller must use adapter.stream directly');
  }
  return queue.enqueue(adapter.name || p, async ()=>{
    const t0 = Date.now();
    try{
      // rate limiter: acquire token for this provider
      try{
        const rl = await rateLimiter.acquire(adapter.name || p);
        if(!rl.ok){
          const err = new Error('Rate limited');
          err.code = 'RATE_LIMIT';
          throw err;
        }
      }catch(e){
        // if rate limiter fails unexpectedly, continue and attempt provider call
      }
      const response = await adapter.call(prompt, model, opts);
      const latency = Date.now()-t0;
      try{ analytics.recordUsage(adapter.name||p, latency); }catch(e){}
      try{ const metrics = require('../services/metricsService'); metrics.recordProvider(adapter.name||p, latency); }catch(e){}
      return { provider: adapter.name || p, model, response, time: latency };
    }catch(err){
      // If developer fallback is enabled, return a safe echo instead of failing
      const devFallback = String(process.env.DEV_FALLBACK || 'false').toLowerCase() === 'true';
      if(devFallback){
        const latency = Date.now()-t0;
        const echo = `You said: ${String(prompt).slice(0, 200)}`;
        try{ analytics.recordUsage(adapter.name||p, latency); }catch(e){}
        try{ const metrics = require('../services/metricsService'); metrics.recordProvider(adapter.name||p, latency); }catch(e){}
        return { provider: adapter.name || p, model, response: echo, time: latency };
      }
      throw err;
    }
  }, opts);
}

// callProvider: sequential failover (keeps previous behavior)
async function callProvider(primaryProvider, model, prompt, opts = {}){
  const fallbacks = opts.fallbacks || [primaryProvider, 'huggingface', 'openai', 'claude', 'gemini', 'playwright'];
  let lastErr = null;
  for(const p of fallbacks){
    try{
      const res = await tryProviderOnce(p, model, prompt, opts);
      return res;
    }catch(err){
      lastErr = err;
      const msg = String(err && (err.message || err)).toLowerCase();
      // continue on rate errors or other provider errors
      continue;
    }
  }
  throw lastErr || new Error('No providers available');
}

// call multiple providers and merge according to strategy
// strategy: 'first' (default), 'concat' (concatenate results), 'race' (first completed)
async function callProviders(providers, model, prompt, opts={strategy:'first'}){
  const provs = Array.isArray(providers) ? providers : [providers];
  const strategy = opts.strategy || 'first';
  if(strategy === 'first'){
    for(const p of provs){
      try{ const r = await callProvider(p, model, prompt, opts); return r; }catch(e){ continue; }
    }
    throw new Error('No providers available');
  }

  if(strategy === 'race'){
    // start all and return the first successful
    const promises = provs.map(p=> tryProviderOnce(p, model, prompt, opts).then(r=>({ ok:true, r })).catch(e=>({ ok:false, e })));
    const res = await Promise.race(promises);
    if(res && res.ok) return res.r;
    throw new Error('No providers succeeded in race');
  }

  if(strategy === 'concat'){
    const results = await Promise.allSettled(provs.map(p=> tryProviderOnce(p, model, prompt, opts)));
    const successes = results.filter(r=>r.status === 'fulfilled').map(r=>r.value);
    if(successes.length === 0) throw new Error('No providers succeeded');
    const combined = successes.map(s=>`[Provider: ${s.provider}]
${String(s.response || s.response || '')}`).join('\n\n---\n\n');
    return { provider: 'merged', model, response: combined, time: successes.reduce((a,b)=>a+(b.time||0),0) };
  }

  throw new Error('Unknown strategy: ' + strategy);
}

module.exports = { callProvider, callProviders };

