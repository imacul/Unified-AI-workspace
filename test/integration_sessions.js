const http = require('http');
const fs = require('fs');
const path = require('path');

// start the server in this process
require('../main.js');

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
        'Content-Length': Buffer.byteLength(data),
        ...(process.env.AUTH_ENABLED === 'true' && process.env.AUTH_TOKEN ? { 'Authorization': `Bearer ${process.env.AUTH_TOKEN}` } : {})
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

setTimeout(async () => {
  const sessionId = 'integration-1';
  const payload = { sessionId, text: 'Integration test message', provider: 'claude', model: 'Claude 3.5 Sonnet' };
  try{
    const res = await post(payload);
    console.log('Status:', res.statusCode);
    console.log('Body:', res.body);
    if(res.statusCode !== 200) return process.exit(2);

    // give the server a moment to persist sessions
    setTimeout(async () => {
      const sessionsPath = path.join(__dirname, '..', 'sessions.json');
      // If REDIS_ONLY is enabled, try to fetch session via memoryService
      const redisOnly = process.env.REDIS_ONLY === 'true';
      try{
        if(redisOnly){
          const memory = require('../server/services/memoryService');
          const sess = await memory.getSession(sessionId);
          if(!sess || !Array.isArray(sess)){
            console.error('Session missing or invalid (redis mode)');
            return process.exit(4);
          }
          const hasUser = sess.some(m => m.role === 'user' && m.content && m.content.includes('Integration test message'));
          const hasAssistant = sess.some(m => m.role === 'assistant' && m.content);
          if(!hasUser){ console.error('User message not found in session (redis mode)'); return process.exit(5); }
          if(!hasAssistant){ console.error('Assistant response not found in session (redis mode)'); return process.exit(6); }
          console.log('Integration test passed (redis mode)');
          return process.exit(0);
        }

        if (!fs.existsSync(sessionsPath)){
          console.error('sessions.json not found');
          return process.exit(3);
        }
        const raw = fs.readFileSync(sessionsPath, 'utf8');
        try{
          const sessions = JSON.parse(raw);
          const sess = sessions[sessionId];
          if(!sess || !Array.isArray(sess)){
            console.error('Session missing or invalid');
            return process.exit(4);
          }
          const hasUser = sess.some(m => m.role === 'user' && m.content && m.content.includes('Integration test message'));
          const hasAssistant = sess.some(m => m.role === 'assistant' && m.content);
          if(!hasUser){ console.error('User message not found in session'); return process.exit(5); }
          if(!hasAssistant){ console.error('Assistant response not found in session'); return process.exit(6); }
          console.log('Integration test passed');
          process.exit(0);
        }catch(err){
          console.error('Failed to parse sessions.json', err);
          process.exit(7);
        }
      }catch(err){ console.error('Integration session check error', err); process.exit(8); }
    }, 200);

  }catch(err){
    console.error('Test error:', err);
    process.exit(1);
  }
}, 300);
