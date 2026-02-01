// Simple rate limiter with Redis-backed fixed window and in-memory fallback.
// Configuration via env: RATE_LIMIT_PER_MINUTE (default 60)

let redisClient = null;
const inMemory = new Map();

const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MINUTE || process.env.RATE_PER_MIN || 60);

function init(redis){
  if(redis) redisClient = redis;
}

async function acquire(key, weight=1){
  try{
    const k = `ratelimit:${key}`;
    if(redisClient){
      // Use INCR with EXPIRE for simple fixed-window
      const cur = await redisClient.incrBy(k, weight);
      if(cur === weight){
        // newly created key, set ttl
        await redisClient.expire(k, 60);
      }
      if(cur > RATE_PER_MIN) {
        console.warn(`[rateLimiter] redis ${k} used=${cur} limit=${RATE_PER_MIN}`);
        return { ok:false, remaining: 0, used: cur };
      }
      console.debug && console.debug(`[rateLimiter] redis ${k} used=${cur} limit=${RATE_PER_MIN}`);
      return { ok:true, remaining: Math.max(0, RATE_PER_MIN - cur), used: cur };
    }
  }catch(e){ console.error('rateLimiter redis error', e); }

  // In-memory fallback (not shared across processes)
  const now = Math.floor(Date.now()/1000);
  const windowKey = `${key}:${Math.floor(now/60)}`;
  const cur = (inMemory.get(windowKey) || 0) + weight;
  inMemory.set(windowKey, cur);
  // cleanup map size occasionally
  if(inMemory.size > 1000){
    for(const k of inMemory.keys()){
      if(!k.endsWith(String(Math.floor(now/60)))) inMemory.delete(k);
    }
  }
  if(cur > RATE_PER_MIN){ console.warn(`[rateLimiter] mem ${windowKey} used=${cur} limit=${RATE_PER_MIN}`); return { ok:false, remaining:0, used:cur }; }
  console.debug && console.debug(`[rateLimiter] mem ${windowKey} used=${cur} limit=${RATE_PER_MIN}`);
  return { ok:true, remaining: RATE_PER_MIN - cur, used: cur };
}

// Token-bucket per-provider rate limiter with in-memory and Redis-backed options.
const state = require('./state');
const { promisify } = require('util');

const buckets = new Map();

function ensureBucket(provider, capacity=10, refillInterval=1000, refillAmount=1){
  if(!buckets.has(provider)){
    buckets.set(provider, {
      tokens: capacity,
      capacity,
      refillInterval,
      refillAmount,
      lastRefill: Date.now()
    });
  }
  return buckets.get(provider);
}

function refill(bucket){
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  if(elapsed <= 0) return;
  const steps = Math.floor(elapsed / bucket.refillInterval);
  if(steps > 0){
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + steps * bucket.refillAmount);
    bucket.lastRefill = bucket.lastRefill + steps * bucket.refillInterval;
  }
}

// Redis-backed atomic token-bucket using EVAL with a small Lua script
const LUA_SCRIPT = `
local tokens = tonumber(redis.call('get', KEYS[1]) or ARGV[1])
local last = tonumber(redis.call('get', KEYS[2]) or ARGV[4])
local capacity = tonumber(ARGV[1])
local refillInterval = tonumber(ARGV[2])
local refillAmount = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local consume = tonumber(ARGV[5])
local elapsed = now - last
if elapsed > 0 then
  local steps = math.floor(elapsed / refillInterval)
  if steps > 0 then
    tokens = math.min(capacity, tokens + steps * refillAmount)
    last = last + steps * refillInterval
  end
end
if tokens >= consume then
  tokens = tokens - consume
  redis.call('set', KEYS[1], tokens)
  redis.call('set', KEYS[2], last)
  return 1
else
  redis.call('set', KEYS[1], tokens)
  redis.call('set', KEYS[2], last)
  return 0
end
`;

async function takeToken(provider, opts={capacity:10, refillInterval:1000, refillAmount:1}){
  const client = state.getRedisClient && state.getRedisClient();
  if(state.isRedisEnabled() && client){
    try{
      const keyTokens = `bucket:${provider}:tokens`;
      const keyLast = `bucket:${provider}:last`;
      const now = Date.now();
      const res = await client.eval(LUA_SCRIPT, { keys: [keyTokens, keyLast], arguments: [String(opts.capacity||10), String(opts.refillInterval||1000), String(opts.refillAmount||1), String(now), '1'] });
      return !!(res === 1 || res === '1');
    }catch(e){
      console.error('Redis rateLimiter eval error', e);
      // fallback to in-memory
    }
  }

  const bucket = ensureBucket(provider, opts.capacity, opts.refillInterval, opts.refillAmount);
  refill(bucket);
  if(bucket.tokens >= 1){ bucket.tokens -= 1; return true; }
  return false;
}

module.exports = { init, acquire, RATE_PER_MIN, takeToken, ensureBucket };
