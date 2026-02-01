#!/usr/bin/env node
// Migration script: copy sessions.json into Redis (per-session keys)
const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(__dirname, '..', '..', 'sessions.json');
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS;

async function main(){
  if(!REDIS_URL){
    console.error('REDIS_URL not set. Aborting.');
    process.exit(1);
  }
  if(!fs.existsSync(SESSIONS_FILE)){
    console.error('sessions.json not found. Nothing to migrate.');
    process.exit(0);
  }
  const raw = fs.readFileSync(SESSIONS_FILE,'utf8');
  const all = JSON.parse(raw || '{}');
  const { createClient } = require('redis');
  const client = createClient({ url: REDIS_URL });
  client.on('error', e => console.error('Redis error', e));
  await client.connect();
  const ids = Object.keys(all);
  for(const id of ids){
    const key = `session:${id}`;
    const data = all[id];
    await client.set(key, JSON.stringify(data));
    await client.hSet('sessions_index', id, JSON.stringify({ updated: Date.now(), count: data.length }));
    console.log('migrated', id);
  }
  await client.quit();
  console.log('Migration complete');
}

main().catch(e => { console.error(e); process.exit(2); });
