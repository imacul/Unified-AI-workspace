const helpers = require('../../main_helpers');
const ProviderBase = require('./providerBase');

let _forceFail = false; // dev-only toggle to simulate HF failures

class HFAdapter extends ProviderBase{
  constructor(){ super('huggingface'); }
  enableForceFail(v){ _forceFail = !!v; }
  isForcingFail(){ return !!_forceFail; }
  async call(prompt, model){
    if(_forceFail) throw new Error('Simulated Hugging Face failure (DEV)');
    if(typeof helpers.callHuggingFace !== 'function') throw new Error('Hugging Face helper not available');
    return await helpers.callHuggingFace(prompt, model);
  }
  async stream(prompt, model, res, sessionId, onDelta){
    if(_forceFail){
      res.write(`data: ${JSON.stringify({ error: 'Simulated Hugging Face failure (DEV)' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if(typeof helpers.callHuggingFaceStream !== 'function') throw new Error('Hugging Face stream helper not available');
    return helpers.callHuggingFaceStream(prompt, model, '', res, sessionId, onDelta);
  }
}

const instance = new HFAdapter();
// export setter for dev toggling
instance.setForceFail = (v) => instance.enableForceFail(v);
instance.getForceFail = () => instance.isForcingFail();

module.exports = instance;
