function parseJSONBody(req){
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data', c=>body+=c);
    req.on('end', ()=>{
      try{ const parsed = JSON.parse(body||'{}'); resolve(parsed); }catch(e){ reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = { parseJSONBody };
