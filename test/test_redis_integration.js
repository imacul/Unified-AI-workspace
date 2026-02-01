const redisUrl = process.env.REDIS_URL || process.env.REDIS;
(async ()=>{
  if(!redisUrl){ console.log('No REDIS_URL set; skipping Redis integration test'); process.exit(0); }
  try{
    const { createClient } = require('redis');
    const c = createClient({ url: redisUrl });
    c.on('error', (e)=>{});
    await c.connect();
    await c.set('ai_workspace_test_key', 'ok');
    const v = await c.get('ai_workspace_test_key');
    await c.del('ai_workspace_test_key');
    await c.quit();
    if(v !== 'ok'){ console.error('Redis test failed: unexpected value', v); process.exit(2); }
    console.log('Redis integration test passed');
    process.exit(0);
  }catch(err){ console.error('Redis integration test error', err); process.exit(1); }
})();
