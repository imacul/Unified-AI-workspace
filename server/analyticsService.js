// Lightweight analytics aggregation service (file-backed + Redis optional)
const fs = require('fs');
const path = require('path');
let redis = null;
try{ redis = require('./state').getRedisClient(); }catch(e){}

const FILE = path.join(__dirname, '..', 'analytics.json');

function recordUsage(provider, latency){
  const now = Date.now();
  const rec = { provider, latency, ts: now };
  try{
    if(redis){
      redis.rPush('analytics:usage', JSON.stringify(rec)).catch(()=>{});
    }
    let all = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE,'utf8')||'[]') : [];
    all.push(rec);
    if(all.length > 1000) all = all.slice(-1000);
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2),'utf8');
  }catch(e){ console.warn('analytics record failed', e); }
}

async function getSummary(){
  try{
    if(redis){
      const items = await redis.lRange('analytics:usage', -1000, -1);
      const parsed = items.map(i=>JSON.parse(i));
      return { items: parsed };
    }
    const all = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE,'utf8')||'[]') : [];
    return { items: all };
  }catch(e){ return { items: [] }; }
}

module.exports = { recordUsage, getSummary };
