const fs = require('fs');
const path = require('path');
const state = require('./state');

const METRICS_FILE = path.join(__dirname, '..', '..', 'analytics.json');

async function recordUsage(provider, latencyMs){
  try{
    if(state.isRedisEnabled()){
      const client = state.getRedisClient();
      if(client){
        await client.hIncrBy('metrics:usage', provider, 1);
        await client.hSet('metrics:latency', provider, latencyMs);
        return;
      }
    }
    const data = fs.existsSync(METRICS_FILE) ? JSON.parse(fs.readFileSync(METRICS_FILE,'utf8')||'{}') : {};
    data[provider] = data[provider] || { count:0, lastLatency:0 };
    data[provider].count += 1;
    data[provider].lastLatency = latencyMs;
    fs.writeFileSync(METRICS_FILE, JSON.stringify(data,null,2),'utf8');
  }catch(e){ console.error('analytics record error', e); }
}

async function getSummary(){
  try{
    if(state.isRedisEnabled()){
      const client = state.getRedisClient();
      if(client){
        const usage = await client.hGetAll('metrics:usage');
        const latency = await client.hGetAll('metrics:latency');
        const result = {};
        for(const k of Object.keys(usage||{})){
          result[k] = { count: Number(usage[k]||0), lastLatency: Number(latency[k]||0) };
        }
        return { providers: result, source: 'redis' };
      }
    }
    const data = fs.existsSync(METRICS_FILE) ? JSON.parse(fs.readFileSync(METRICS_FILE,'utf8')||'{}') : {};
    return { providers: data, source: 'file' };
  }catch(e){ console.error('analytics getSummary error', e); return { error: String(e) }; }
}

module.exports = { recordUsage, getSummary };
