const openai = require('./openaiAdapter');
const hf = require('./huggingfaceAdapter');
const playwright = require('./playwrightAdapter');

const claude = require('./claudeAdapter');
const gemini = require('./geminiAdapter');

const adapters = {
  openai,
  huggingface: hf,
  hf,
  playwright,
  claude,
  gemini
};

function getAdapter(name){
  if(!name) return null;
  name = String(name).toLowerCase();
  if(adapters[name]) return adapters[name];
  // allow fuzzy matches
  if(name.includes('open')) return adapters.openai;
  if(name.includes('hug') || name.includes('hf')) return adapters.hf;
  if(name.includes('play') || name.includes('browser')) return adapters.playwright;
  return null;
}

module.exports = { getAdapter };
