const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.SERVE_PORT || 5500;

const root = path.join(__dirname, '..');

const mime = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if(p === '/') p = '/index.html';
  const file = path.join(root, p);
  if(!file.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if(err){ res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, ()=> console.log(`Static server running at http://localhost:${port}`));
