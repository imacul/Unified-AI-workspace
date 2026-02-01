const fs = require('fs');
const path = require('path');

const EventEmitter = require('events');
let redisClient = null;
let useRedis = false;
const emitter = new EventEmitter();

function init(redis) {
  if (redis) {
    redisClient = redis;
    useRedis = true;
  }
}

const SESSIONS_FILE = path.join(__dirname, '..', '..', 'sessions.json');

const encryption = require('./encryptionService');

async function getSession(sessionId){
  if(!sessionId) sessionId='default';
  if(useRedis){
    try{
      const raw = await redisClient.get(`session:${sessionId}`);
      if(!raw) return [];
      if(encryption.isEnabled()){
        try{ return encryption.decryptJSON(raw); }catch(e){ console.error('decrypt getSession', e); return []; }
      }
      return raw ? JSON.parse(raw) : [];
    }catch(e){ console.error('Redis getSession error', e); }
  }
  try{
    if(!fs.existsSync(SESSIONS_FILE)) return [];
    const all = JSON.parse(fs.readFileSync(SESSIONS_FILE,'utf8')||'{}');
    const val = all[sessionId] || [];
    if(encryption.isEnabled() && typeof val === 'string'){
      try{ return encryption.decryptJSON(val); }catch(e){ console.error('decrypt file getSession', e); return []; }
    }
    return val;
  }catch(e){ console.error('file getSession', e); return []; }
}

async function appendMessage(sessionId, message){
  if(!sessionId) sessionId='default';
  // message = { role, content, provider, model, timestamp }
  if(useRedis){
    try{
      const key = `session:${sessionId}`;
      const raw = await redisClient.get(key);
      const arr = raw ? (encryption.isEnabled() ? encryption.decryptJSON(raw) : JSON.parse(raw)) : [];
      arr.push(message);
      if(arr.length>100) arr.splice(0, arr.length-100);
      const store = encryption.isEnabled() ? encryption.encryptJSON(arr) : JSON.stringify(arr);
      await redisClient.set(key, store);
      // also update aggregate key for listing
      await redisClient.hSet('sessions_index', sessionId, JSON.stringify({ updated: Date.now(), count: arr.length }));
      // emit event for cognitive loop
      try{ emitter.emit('messageAppended', sessionId, message); }catch(e){}
      return;
    }catch(e){ console.error('Redis appendMessage', e); }
  }
  try{
    const all = fs.existsSync(SESSIONS_FILE) ? JSON.parse(fs.readFileSync(SESSIONS_FILE,'utf8')||'{}') : {};
    all[sessionId] = all[sessionId] || [];
    all[sessionId].push(message);
    if(all[sessionId].length>100) all[sessionId]=all[sessionId].slice(-100);
    if(encryption.isEnabled()){
      // store as encrypted string per-session
      all[sessionId] = encryption.encryptJSON(all[sessionId]);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(all, null, 2),'utf8');
    try{ emitter.emit('messageAppended', sessionId, message); }catch(e){}
  }catch(e){ console.error('file appendMessage', e); }
}

async function listSessions(){
  if(useRedis){
    try{ const keys = await redisClient.hKeys('sessions_index'); return keys; }catch(e){ console.error('redis listSessions', e); }
  }
  try{ const all = fs.existsSync(SESSIONS_FILE) ? JSON.parse(fs.readFileSync(SESSIONS_FILE,'utf8')||'{}') : {}; return Object.keys(all); }catch(e){ return []; }
}

async function exportSession(sessionId){
  return await getSession(sessionId);
}

async function searchSessions(query, opts={limit:50}){
  const q = String(query || '').trim().toLowerCase();
  if(!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const sessions = await listSessions();
  const scored = [];
  for(const id of sessions){
    const msgs = await getSession(id);
    for(const m of msgs){
      const text = String(m.content||'').toLowerCase();
      let score = 0;
      for(const t of tokens){ if(text.includes(t)) score += 1; }
      if(score > 0){
        // recency weight (more recent messages score higher)
        const ageMs = Date.now() - (m.timestamp || 0);
        const recency = Math.max(1, Math.floor( (1e8) / (ageMs + 1) ));
        const finalScore = score * recency;
        // extract snippet centered on first match
        let snippet = String(m.content || '');
        const idx = snippet.toLowerCase().indexOf(tokens[0]);
        if(idx !== -1){
          const start = Math.max(0, idx - 80);
          snippet = snippet.slice(start, Math.min(snippet.length, idx + 120));
          if(start > 0) snippet = '...' + snippet;
          if(idx + 120 < m.content.length) snippet = snippet + '...';
        }
        scored.push({ sessionId: id, message: m, score: finalScore, snippet });
      }
    }
  }
  // sort by score desc
  scored.sort((a,b)=>b.score - a.score);
  return scored.slice(0, opts.limit || 50);
}

module.exports = { init, getSession, appendMessage, listSessions, exportSession, searchSessions, emitter };
