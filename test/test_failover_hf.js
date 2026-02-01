const http = require('http');

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

function post(path, obj){
  return new Promise((resolve,reject)=>{
    const data = JSON.stringify(obj);
    const url = new URL(path, SERVER);
    const opts = { method: 'POST', hostname: url.hostname, port: url.port, path: url.pathname, headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(opts, res => {
      let b=''; res.on('data', c=> b+=c); res.on('end', ()=> { try{ resolve({ status: res.statusCode, body: JSON.parse(b||'{}') }); }catch(e){ resolve({ status: res.statusCode, body: b }); } });
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

async function sendMessage(text){
  return post('/sendmessage', { text, provider: 'huggingface', model: 'meta-llama/Llama-3.1-8B-Instruct', sessionId: 'failover-test' });
}

async function run(){
  console.log('Ensure server is running and DEV_FALLBACK=true');
  console.log('1) Sending normal HF request...');
  let r = await sendMessage('Hello from HF test');
  console.log('Response 1:', r.status, r.body);

  console.log('2) Enabling simulated HF failure via /dev/fail/hf');
  await post('/dev/fail/hf', { enabled: true });

  console.log('3) Sending request while HF is forced to fail; expect fallback (DEV_FALLBACK)');
  r = await sendMessage('This should trigger fallback');
  console.log('Response 2:', r.status, r.body);

  console.log('4) Disabling simulated HF failure');
  await post('/dev/fail/hf', { enabled: false });
  console.log('5) Sending request again (HF should respond)');
  r = await sendMessage('HF restored');
  console.log('Response 3:', r.status, r.body);
}

run().catch(e=>{ console.error('Test failed', e); process.exit(1); });
