const https = require('https');
const mainHelpers = require('../main_helpers');

(async ()=>{
  const adapters = require('../server/adapters');
  const origCallOpenAI = mainHelpers.callOpenAI;
  const origCallHF = mainHelpers.callHuggingFace;
  const origHttpsRequest = https.request;

  try{
    // OpenAI adapter via main_helpers stub
    mainHelpers.callOpenAI = async (prompt, model) => {
      return `OpenAI response for: ${String(prompt).slice(0,40)}`;
    };
    const openai = require('../server/adapters/openaiAdapter');
    const ores = await openai.call('hello', 'gpt-test');
    if(!ores.includes('OpenAI response')) throw new Error('OpenAI adapter parsing failed');
    console.log('OpenAI adapter parsing passed');

    // Hugging Face adapter via main_helpers stub
    mainHelpers.callHuggingFace = async (prompt, model) => {
      return `HF reply for: ${String(prompt).slice(0,40)}`;
    };
    const hf = require('../server/adapters/huggingfaceAdapter');
    const hfres = await hf.call('hi there', 'meta-llama/test');
    if(!hfres.includes('HF reply')) throw new Error('HuggingFace adapter parsing failed');
    console.log('HuggingFace adapter parsing passed');

    // Claude adapter: mock https.request to return various shapes
    process.env.CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || 'test';
    https.request = (options, cb) => {
      const res = { statusCode: 200, listeners: {}, on(fn, handler){ this.listeners[fn]=handler; }, emitData(json){ if(this.listeners['data']) this.listeners['data'](Buffer.from(JSON.stringify(json))); if(this.listeners['end']) this.listeners['end'](); } };
      setImmediate(()=> cb(res));
      const req = { write(){}, end(){ setImmediate(()=> res.emitData({ completion: 'Claude said hi' })); }, on(){}};
      return req;
    };
    const claude = require('../server/adapters/claudeAdapter');
    const cres = await claude.call('prompt', 'claude-test');
    if(!cres.includes('Claude')) throw new Error('Claude adapter parsing failed');
    console.log('Claude adapter parsing passed');

    // Gemini adapter: mock https.request with alternate response shapes
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test';
    https.request = (options, cb) => {
      const res = { statusCode: 200, listeners:{}, on(fn, handler){ this.listeners[fn]=handler; }, emitData(json){ if(this.listeners['data']) this.listeners['data'](Buffer.from(JSON.stringify(json))); if(this.listeners['end']) this.listeners['end'](); } };
      setImmediate(()=> cb(res));
      const req = { write(){}, end(){ setImmediate(()=> res.emitData({ candidates: [{ output: 'Gemini says hello' }] })); }, on(){}};
      return req;
    };
    const gem = require('../server/adapters/geminiAdapter');
    const gres = await gem.call('prompt', 'gemini-test');
    if(!gres.includes('Gemini')) throw new Error('Gemini adapter parsing failed');
    console.log('Gemini adapter parsing passed');

    console.log('All adapter parsing tests passed');
    process.exit(0);
  }catch(err){
    console.error('Adapter parsing tests failed', err);
    process.exit(1);
  }finally{
    // restore
    mainHelpers.callOpenAI = origCallOpenAI;
    mainHelpers.callHuggingFace = origCallHF;
    https.request = origHttpsRequest;
  }
})();
