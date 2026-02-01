const { parseJSONBody } = require('../utils/httpUtils');
const { signToken } = require('../services/authService');

// Simple token exchange endpoint for development: validates against AUTH_USER/AUTH_PASS env vars
async function handleToken(req, res){
  try{
    const data = await parseJSONBody(req);
    const user = data.email || data.username || '';
    const pass = data.password || '';
    const envUser = process.env.AUTH_USER || '';
    const envPass = process.env.AUTH_PASS || '';
    if(!envUser || !envPass){ res.writeHead(400, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: 'AUTH_USER/AUTH_PASS not configured on server' })); return; }
    if(user !== envUser || pass !== envPass){ res.writeHead(401, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: 'Invalid credentials' })); return; }
    const token = signToken({ sub: user });
    res.writeHead(200, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' });
    res.end(JSON.stringify({ token }));
  }catch(err){ res.writeHead(500, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify({ error: String(err) })); }
}

module.exports = { handleToken };
