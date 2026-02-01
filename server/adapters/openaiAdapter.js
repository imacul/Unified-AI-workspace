const helpers = require('../../main_helpers');
const ProviderBase = require('./providerBase');

class OpenAIAdapter extends ProviderBase{
  constructor(){ super('openai'); }
  async call(prompt, model){
    if(typeof helpers.callOpenAI !== 'function') throw new Error('OpenAI helper not available');
    return await helpers.callOpenAI(prompt, model);
  }
}

module.exports = new OpenAIAdapter();
