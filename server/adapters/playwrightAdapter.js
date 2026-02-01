const ProviderBase = require('./providerBase');
const fs = require('fs');
const path = require('path');

class PlaywrightAdapter extends ProviderBase{
  constructor(){ super('playwright'); this.browser = null; }
  async init(opts){
    // Optional: initialize a Playwright browser here if desired
  }
  async call(prompt, model, opts={}){
    // Attempt to load a provider-specific script from ./scripts/<name>.js
    const scriptName = opts.script || opts.provider || model || 'default';
    const scriptPath = path.join(__dirname, 'scripts', `${scriptName}.js`);
    try{
      if(!fs.existsSync(scriptPath)){
        throw new Error(`Playwright script not found: ${scriptPath}`);
      }
      const playwright = require('playwright');
      const script = require(scriptPath);
      const browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();
      let result = null;
      if(typeof script.run === 'function'){
        result = await script.run({ page, prompt, model, opts });
      } else {
        throw new Error('Script must export async function run({page,prompt,model,opts})');
      }
      await browser.close();
      return result;
    }catch(err){
      if(String(err.message||err).includes('Cannot find module')){
        throw new Error('Playwright not installed. Run `npm install playwright` to enable automation adapter.');
      }
      throw err;
    }
  }
}

module.exports = new PlaywrightAdapter();
