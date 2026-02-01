const memory = require('./memoryService');
const providerRouter = require('./providerRouter');
const SUMMARY_THRESHOLD = parseInt(process.env.SUMMARY_THRESHOLD || '10', 10);
const SUMMARY_PROVIDER = process.env.SUMMARY_PROVIDER || 'openai';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || 'gpt-4o';
const SUMMARY_INTERVAL_MS = parseInt(process.env.SUMMARY_INTERVAL_MS || String(1000 * 60 * 60 * 6), 10); // 6 hours

const pending = new Map(); // sessionId -> count since last summary

async function maybeSummarize(sessionId){
  try{
    const msgs = await memory.getSession(sessionId);
    if(!msgs || msgs.length === 0) return;
    const recent = msgs.slice(-40);
    const text = recent.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `Summarize the following conversation into concise bullet points with key decisions and action items:\n\n${text}`;
    try{
      const res = await providerRouter.callProvider(SUMMARY_PROVIDER, SUMMARY_MODEL, prompt, { fallbacks: [SUMMARY_PROVIDER, 'openai', 'huggingface'] });
      const summaryText = String(res.response || res || '').trim();
      if(summaryText){
        await memory.appendMessage(sessionId, { role: 'system', content: `Summary:\n${summaryText}`, provider: 'system', model: 'summary', timestamp: Date.now() });
        pending.set(sessionId, 0);
      }
    }catch(err){
      console.warn('cognitiveLoop: summarization failed for', sessionId, err && err.message ? err.message : err);
    }
  }catch(e){ console.error('cognitiveLoop error', e); }
}

// event handler when a new message appended
memory.emitter.on('messageAppended', (sessionId, message) => {
  if(!sessionId) sessionId='default';
  if(message && (message.role === 'assistant' || message.role === 'user')){
    const c = pending.get(sessionId) || 0;
    pending.set(sessionId, c+1);
    if((c+1) >= SUMMARY_THRESHOLD){
      // schedule summarize but don't block
      setTimeout(()=> maybeSummarize(sessionId), 10);
    }
  }
});

// periodic sweeper
setInterval(async ()=>{
  try{
    const sessions = await memory.listSessions();
    for(const sid of sessions){
      const c = pending.get(sid) || 0;
      if(c > 0){ // if there has been activity, run a summary
        await maybeSummarize(sid);
      }
    }
  }catch(e){ console.error('cognitiveLoop sweeper error', e); }
}, SUMMARY_INTERVAL_MS);

module.exports = { maybeSummarize };
