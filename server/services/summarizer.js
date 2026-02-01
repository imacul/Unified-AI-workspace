const fs = require('fs');
const path = require('path');
const memory = require('./memoryService');
const hfAdapter = require('../adapters/huggingfaceAdapter');

const SUMMARIES_FILE = path.join(__dirname, '..', '..', 'summaries.json');

let redisClient = null;
let intervalMs = 10 * 60 * 1000; // default 10 minutes
let intervalHandle = null;
const pending = new Map();

function init(opts = {}){
  redisClient = opts.redis || null;
  if(opts.intervalMs) intervalMs = opts.intervalMs;
  // listen for appended messages to schedule quick summarization
  memory.emitter.on('messageAppended', (sessionId, message)=>{
    scheduleSummarize(sessionId, 5 * 1000); // debounce 5s
  });
  // periodic full sweep
  if(intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => { sweepSummarize(); }, intervalMs);
}

function stop(){ if(intervalHandle) clearInterval(intervalHandle); }

function scheduleSummarize(sessionId, delay=5000){
  if(pending.has(sessionId)) clearTimeout(pending.get(sessionId));
  const t = setTimeout(()=>{ pending.delete(sessionId); summarizeSession(sessionId).catch(e=>console.error('summarizeSession', e)); }, delay);
  pending.set(sessionId, t);
}

async function sweepSummarize(){
  try{
    const ids = await memory.listSessions();
    for(const id of ids){ scheduleSummarize(id, 0); }
  }catch(e){ console.error('sweepSummarize', e); }
}

async function summarizeSession(sessionId){
  try{
    const msgs = await memory.getSession(sessionId);
    if(!msgs || msgs.length === 0) return null;
    // take last 20 messages
    const recent = msgs.slice(-20);
    const concat = recent.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const prompt = `You are a concise summarizer. Given the conversation messages below, produce:\n- a one-line title\n- three concise bullet points summarizing the key facts, decisions, or tasks\n- one-line "next steps" suggestion\n\nConversation:\n${concat}`;

    let summaryText = null;
    // prefer HF adapter if available
    try{
      if(hfAdapter && typeof hfAdapter.call === 'function' && !hfAdapter.getForceFail()){
        summaryText = await hfAdapter.call(prompt, process.env.HF_SUMMARY_MODEL || 'meta-llama/Llama-3.1-8B-Instruct');
      }
    }catch(e){
      console.error('HF summarizer error', e.message || e);
      summaryText = null;
    }

    if(!summaryText){
      // fallback: a naive extractive summary
      const joined = recent.map(m=>m.content).join(' ');
      const title = joined.slice(0,60).replace(/\s+/g,' ').trim();
      const bullets = [];
      bullets.push(joined.slice(0,120).replace(/\s+/g,' ').trim());
      bullets.push(joined.slice(120,260).replace(/\s+/g,' ').trim());
      bullets.push(joined.slice(260,420).replace(/\s+/g,' ').trim());
      const next = 'Continue the conversation by clarifying open questions or assigning next steps.';
      summaryText = `Title: ${title}\n\n- ${bullets[0]}\n- ${bullets[1]}\n- ${bullets[2]}\n\nNext: ${next}`;
    }

    const stored = { sessionId, summary: summaryText, updated: Date.now() };
    // persist to redis if available
    try{
      if(redisClient){ await redisClient.set(`session_summary:${sessionId}`, JSON.stringify(stored)); }
    }catch(e){ console.error('redis set summary', e); }

    // always write to summaries.json as fallback
    try{
      let all = {};
      if(fs.existsSync(SUMMARIES_FILE)) all = JSON.parse(fs.readFileSync(SUMMARIES_FILE,'utf8')||'{}');
      all[sessionId] = stored;
      fs.writeFileSync(SUMMARIES_FILE, JSON.stringify(all, null, 2),'utf8');
    }catch(e){ console.error('write summaries file', e); }

    return stored;
  }catch(e){ console.error('summarizeSession top', e); return null; }
}

async function getSummary(sessionId){
  try{
    if(redisClient){
      const raw = await redisClient.get(`session_summary:${sessionId}`);
      if(raw) return JSON.parse(raw);
    }
    if(fs.existsSync(SUMMARIES_FILE)){ const all = JSON.parse(fs.readFileSync(SUMMARIES_FILE,'utf8')||'{}'); return all[sessionId] || null; }
  }catch(e){ console.error('getSummary', e); }
  return null;
}

module.exports = { init, stop, scheduleSummarize, summarizeSession, getSummary };
