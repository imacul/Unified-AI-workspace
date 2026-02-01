const providerRouter = require('../server/services/providerRouter');

(async ()=>{
  try{
    // Test concat strategy with providers list (will use DEV_FALLBACK echo behavior)
    const res = await providerRouter.callProviders(['claude','huggingface'], 'test-model', 'Merge test prompt', { strategy: 'concat' });
    if(!res || !res.response || !res.response.includes('[Provider:')){ console.error('Provider merge concat failed', res); process.exit(2); }
    console.log('Provider merge concat test passed');
    process.exit(0);
  }catch(err){ console.error('Provider merge test error', err); process.exit(1); }
})();
