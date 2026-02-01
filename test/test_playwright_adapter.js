(async ()=>{
  const adapter = require('../server/adapters/playwrightAdapter');
  try{
    // simple smoke test using the example script
    const res = await adapter.call('example prompt', 'model', { script: 'search_playwright' });
    console.log('Playwright adapter returned:', typeof res === 'string' ? res.slice(0,120) : JSON.stringify(res).slice(0,120));
    console.log('Test passed');
    process.exit(0);
  }catch(err){
    const msg = err && err.message ? err.message : String(err);
    if(msg.includes('npx playwright install') || msg.includes('Executable doesn\'t exist')){
      console.warn('Playwright not fully installed; skipping test. To enable, run `npx playwright install`.');
      process.exit(0);
    }
    console.error('Playwright adapter test failed:', msg);
    process.exit(2);
  }
})();
