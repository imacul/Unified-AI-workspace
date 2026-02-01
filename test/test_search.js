const http = require('http');
require('../main.js');

function post(payload){
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = { hostname: 'localhost', port: 3000, path: '/sendmessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(options, (res) => { let body = ''; res.on('data', chunk => body += chunk); res.on('end', ()=>resolve({ statusCode: res.statusCode, body })); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function get(url){ return new Promise((resolve,reject)=>{ const options={hostname:'localhost',port:3000,path:url,method:'GET'}; const req=http.request(options,(res)=>{ let body=''; res.on('data',c=>body+=c); res.on('end',()=>resolve({ status: res.statusCode, body })); }); req.on('error',reject); req.end(); }); }

setTimeout(async ()=>{
  try{
    await post({ conversationId:'s1', text:'I like apples and bananas', provider:'huggingface', model:'m' });
    await post({ conversationId:'s1', text:'Banana smoothie recipe', provider:'huggingface', model:'m' });
    await post({ conversationId:'s2', text:'Project plan for migration', provider:'openai', model:'gpt' });

    const r = await get('/search?q=banana');
    if(r.status !== 200) { console.error('Search API error', r.status, r.body); return process.exit(2); }
    const parsed = JSON.parse(r.body);
    if(!parsed.results || parsed.results.length === 0) { console.error('Search returned no results', parsed); return process.exit(3); }
    console.log('Search results:', parsed.results.slice(0,3));
    console.log('Search tests passed'); process.exit(0);
  }catch(err){ console.error('Search test error', err); process.exit(1); }
}, 400);