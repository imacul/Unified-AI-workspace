const { createClient } = require('redis');
(async ()=>{
  const url = process.env.REDIS_URL || process.env.REDIS;
  if(!url){ console.error('REDIS_URL not set'); process.exit(1); }
  const client = createClient({ url });
  client.on('error', e=>console.error('Redis error', e));
  await client.connect();
  // Initialize a couple of provider buckets with sane defaults
  const providers = ['openai','huggingface','claude','gemini'];
  for(const p of providers){
    await client.set(`bucket:${p}:tokens`, '10', { NX: true }).catch(()=>{});
    await client.set(`bucket:${p}:last`, String(Date.now()), { NX: true }).catch(()=>{});
  }
  console.log('Initialized provider buckets');
  await client.quit();
  process.exit(0);
})();
