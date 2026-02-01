const http = require('http');
require('../main.js');

function get(url){
  return new Promise((resolve,reject)=>{
    const options = { hostname:'localhost', port:3000, path: url, method:'GET' };
    const req = http.request(options, (res)=>{
      const chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end',()=>resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }); req.on('error',reject); req.end();
  });
}

setTimeout(async ()=>{
  try{
    // create a test session
    const payload = { conversationId: 'exp-1', text: 'Export test', provider: 'huggingface', model: 'test' };
    await new Promise((r,rej)=>{ const req = http.request({ hostname:'localhost', port:3000, path:'/sendmessage', method:'POST', headers:{ 'Content-Type':'application/json' } }, res=>{ res.on('data',()=>{}); res.on('end',r); }); req.on('error',rej); req.write(JSON.stringify(payload)); req.end(); });

    // JSON export
    const j = await get('/export?sessionId=exp-1&format=json');
    if(j.status !== 200) { console.error('JSON export failed', j.status, j.body.toString()); return process.exit(2); }

    // Markdown export
    const m = await get('/export?sessionId=exp-1&format=md');
    if(m.status !== 200) { console.error('MD export failed', m.status, m.body.toString()); return process.exit(3); }

    // PDF export (may be 503 if Playwright not installed)
    const p = await get('/export?sessionId=exp-1&format=pdf');
    if(p.status === 200){ console.log('PDF export available'); }
    else { console.log('PDF export not available or browsers not installed (status', p.status, ')'); }

    console.log('Export tests passed'); process.exit(0);
  }catch(err){ console.error('Export test error', err); process.exit(1); }
}, 300);