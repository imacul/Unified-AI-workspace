class ProviderBase {
  constructor(name){ this.name = name || 'base'; }
  async init(opts) { /* optional init, e.g., create browser */ }
  async call(prompt, model, opts) { throw new Error('Not implemented'); }
}

module.exports = ProviderBase;
