let redisClient = null;
let redisEnabled = false;

function setRedisClient(client) { redisClient = client; redisEnabled = !!client; }
function getRedisClient(){ return redisClient; }
function isRedisEnabled(){ return redisEnabled; }

module.exports = { setRedisClient, getRedisClient, isRedisEnabled };
