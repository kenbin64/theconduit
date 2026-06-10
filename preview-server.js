/* ============================================================================
 * HydroManifold / The Conduit — public demo static server
 * ----------------------------------------------------------------------------
 * Serves the simulation as a PUBLIC, read-only showcase (portfolio piece). No
 * login: every file is reachable. The app runs in simulation only and is not
 * connected to any real water system (see the in-app demobar). Static, no deps.
 * ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';   // behind nginx on the VPS

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';                              // main page = the simulation
  if (rel === '/testreport' || rel === '/testreport/') rel = '/testreport.html';   // live test runner
  if (rel === '/report' || rel === '/report/') rel = '/report.html';               // static report
  if (rel === '/network' || rel === '/network/' || rel === '/3d') rel = '/network3d.html';  // 3D water-network view

  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  if (path.basename(full) === 'preview-server.js') { res.writeHead(404); return res.end('404'); }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('The Conduit (public demo) → http://' + HOST + ':' + PORT + '/');
});
