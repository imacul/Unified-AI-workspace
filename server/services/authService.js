const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const AUTH_ENABLED = String(process.env.AUTH_ENABLED || 'false').toLowerCase() === 'true';

function signToken(payload = {}, opts = {}){
  const expiresIn = opts.expiresIn || '30d';
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token){
  if(!token) throw new Error('No token provided');
  try{
    return jwt.verify(token, JWT_SECRET);
  }catch(err){
    throw new Error('Invalid token');
  }
}

module.exports = { signToken, verifyToken, AUTH_ENABLED };
