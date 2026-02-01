const { verifyToken, AUTH_ENABLED } = require('../services/authService');

function requireAuthOrThrow(req){
  if(!AUTH_ENABLED) return null; // auth not enforced
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if(!auth) throw { status: 401, message: 'Missing Authorization header' };
  const parts = String(auth).split(' ');
  if(parts.length !== 2 || parts[0] !== 'Bearer') throw { status: 401, message: 'Malformed Authorization header' };
  const token = parts[1];
  try{
    return verifyToken(token);
  }catch(err){
    throw { status: 401, message: 'Invalid token' };
  }
}

module.exports = { requireAuthOrThrow };
