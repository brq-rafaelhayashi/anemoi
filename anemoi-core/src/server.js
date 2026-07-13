const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

// Sobe um servidor estatico simples sobre `rootDir` em porta efemera (0).
// Resolve { url, close } quando estiver ouvindo.
function serveStatic(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(rootDir, urlPath);
      if (urlPath.endsWith('/')) {
        filePath = path.join(filePath, 'index.html');
      }

      // Impede path traversal para fora do rootDir.
      const rel = path.relative(rootDir, filePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
        res.writeHead(200, {'Content-Type': mime});
        res.end(data);
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

module.exports = {serveStatic};
