const rateLimiter = require('../server/services/rateLimiter');

(async ()=>{
  // Ensure fresh bucket
  const provider = 'test-provider';
  // consume tokens up to capacity
  let ok = true;
  for(let i=0;i<10;i++){
    const res = await rateLimiter.takeToken(provider, { capacity: 3, refillInterval: 2000, refillAmount: 1 });
    if(i<3){ if(!res){ ok=false; console.error('Expected token to be available at iteration', i); break; } }
    if(i>=3){ if(res){ ok=false; console.error('Expected token to be exhausted at iteration', i); break; } }
  }
  if(!ok){ console.error('Rate limiter test failed'); process.exit(1); }
  console.log('Rate limiter basic test passed');
  process.exit(0);
})();
