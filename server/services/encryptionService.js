const crypto = require('crypto');

// AES-256-GCM helper. Provide ENCRYPTION_KEY env var (base64 or raw 32 byte string)
const KEY_RAW = process.env.ENCRYPTION_KEY || '';
let KEY = null;
if(KEY_RAW){
  try{
    // accept base64-encoded or raw
    KEY = KEY_RAW.length === 44 && KEY_RAW.endsWith('=') ? Buffer.from(KEY_RAW, 'base64') : Buffer.from(KEY_RAW);
    if(KEY.length !== 32) KEY = null;
  }catch(e){ KEY = null; }
}

function isEnabled(){ return !!KEY; }

function encryptJSON(obj){
  if(!KEY) throw new Error('ENCRYPTION_KEY not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptJSON(b64){
  if(!KEY) throw new Error('ENCRYPTION_KEY not configured');
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0,12);
  const tag = buf.slice(12,28);
  const encrypted = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

module.exports = { isEnabled, encryptJSON, decryptJSON };
