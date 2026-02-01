const rateLimiter = require('./rateLimiter');

// Simple per-provider queue with exponential backoff retry when rate-limited
const queues = new Map();

function ensureQueue(provider){
  if(!queues.has(provider)) queues.set(provider, { running: false, tasks: [] });
  return queues.get(provider);
}

function scheduleNext(provider){
  const q = queues.get(provider);
  if(!q) return;
  if(q.running) return;
  const item = q.tasks.shift();
  if(!item) return;
  q.running = true;
  (async ()=>{
    try{
      // check token / rate limiter (supports Redis or in-memory)
      let allowed = true;
      try{
        const rl = await rateLimiter.acquire(provider);
        allowed = !!(rl && rl.ok);
      }catch(e){
        // if acquire fails, fall back to token-bucket takeToken if available
        try{ allowed = await rateLimiter.takeToken(provider, item.opts); }catch(e2){ allowed = true; }
      }
      if(!allowed){
        // re-enqueue with backoff
        const attempts = (item.attempts||0) + 1;
        const delay = Math.min(60000, Math.pow(2, attempts)*250 + Math.floor(Math.random()*200));
        item.attempts = attempts;
        setTimeout(()=>{ q.tasks.unshift(item); q.running = false; scheduleNext(provider); }, delay);
        return;
      }
      const res = await item.fn();
      item.resolve(res);
    }catch(err){
      item.reject(err);
    }finally{
      q.running = false;
      // schedule next task
      setImmediate(()=> scheduleNext(provider));
    }
  })();
}

function enqueue(provider, fn, opts={}){
  const q = ensureQueue(provider);
  return new Promise((resolve, reject) => {
    q.tasks.push({ fn, opts, resolve, reject, attempts: 0 });
    scheduleNext(provider);
  });
}

module.exports = { enqueue };
