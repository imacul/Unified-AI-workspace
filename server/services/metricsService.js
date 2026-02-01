const client = require('prom-client');
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const counters = {
  requestsTotal: new client.Counter({ name: 'ai_workspace_requests_total', help: 'Total API requests', registers: [register] }),
  providerCalls: new client.Counter({ name: 'ai_workspace_provider_calls_total', help: 'Provider calls', labelNames: ['provider'], registers: [register] })
};

const histograms = {
  providerLatencyMs: new client.Histogram({ name: 'ai_workspace_provider_latency_ms', help: 'Provider call latency ms', labelNames: ['provider'], buckets: [50,100,200,500,1000,2000], registers: [register] })
};

function recordRequest(){ counters.requestsTotal.inc(); }
function recordProvider(provider, latencyMs){
  counters.providerCalls.inc({ provider: provider || 'unknown' });
  histograms.providerLatencyMs.observe({ provider: provider || 'unknown' }, latencyMs || 0);
}

function metricsHandler(req, res){
  res.setHeader('Content-Type', register.contentType);
  register.metrics().then(body => res.end(body)).catch(err => { res.statusCode = 500; res.end(String(err)); });
}

async function metricsJSON(){
  try{
    const json = await register.getMetricsAsJSON();
    return json;
  }catch(e){ return { error: String(e) }; }
}

module.exports = { recordRequest, recordProvider, metricsHandler };

