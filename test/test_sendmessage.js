const http = require('http');

function post(payload){
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/sendmessage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try{
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, body: parsed });
        }catch(err){
          reject(new Error('Invalid JSON response: ' + body));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const payload = { conversationId: 'test-1', text: 'Hello from test', provider: 'claude', model: 'Claude 3.5 Sonnet' };
  try{
    const res = await post(payload);
    console.log('Status:', res.statusCode);
    console.log('Body:', res.body);
    if(res.statusCode !== 200) process.exit(2);
    if(!res.body || !res.body.message){
      console.error('Test failure: response missing message');
      process.exit(3);
    }
    console.log('Test passed');
    process.exit(0);
  }catch(err){
    console.error('Test error:', err);
    process.exit(1);
  }
})();
