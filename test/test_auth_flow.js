const http = require('http');
const { execSync } = require('child_process');

(async ()=>{
  try{
    // Start server in background with AUTH_USER/AUTH_PASS set
    const env = Object.assign({}, process.env, { AUTH_USER: 'testuser', AUTH_PASS: 'secret', AUTH_ENABLED: 'true' });
    const server = execSync('node main.js & echo $!', { env });
    // make request to token endpoint
    const postData = JSON.stringify({ username: 'testuser', password: 'secret' });
    const options = { hostname: 'localhost', port: process.env.PORT||3000, path: '/auth/token', method: 'POST', headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(postData) } };
    const req = http.request(options, (res)=>{
      let data=''; res.on('data', c=>data+=c); res.on('end', ()=>{
        try{ const parsed=JSON.parse(data); if(parsed && parsed.token){ console.log('Auth flow test passed'); process.exit(0); } else { console.error('Auth flow failed', data); process.exit(2); } }catch(e){ console.error('Auth parse error', e, data); process.exit(3); }
      });
    });
    req.on('error', (e)=>{ console.error('Request error', e); process.exit(4); });
    req.write(postData); req.end();
  }catch(err){ console.error('Auth flow test error', err); process.exit(1); }
})();
