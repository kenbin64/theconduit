/* ============================================================================
 * HydroManifold — local preview server (form login + session gate)
 * ----------------------------------------------------------------------------
 * Review build BEFORE deploy. A neutral SIGN-IN PAGE is shown first; until a
 * valid session exists, NOTHING identifiable is served — every path returns the
 * generic login page, and no app file, title, or asset is reachable. After a
 * correct sign-in (admin / quenchit) a session cookie is issued and the app is
 * served. Static only, bound to localhost. Production enforces the same gate.
 * ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USER = 'admin', PASS = 'quenchme';
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';   // set HOST=0.0.0.0 to expose on a VPS (or keep local behind nginx)
const sessions = new Set();   // valid session tokens (in-memory)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

// ── neutral sign-in page (reveals nothing about the product) ──
function loginPage(error) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><title>Secure Sign-In</title><style>' +
    '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#070b12;color:#dbe7f5;font-family:"Segoe UI",system-ui,sans-serif}' +
    '.card{width:340px;max-width:92vw;background:#0e1622;border:1px solid #1f2e42;border-radius:14px;padding:30px 28px;' +
    'box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '.lock{font-size:30px;text-align:center}h1{font-size:18px;font-weight:700;text-align:center;margin:10px 0 2px}' +
    '.sub{text-align:center;color:#8195ad;font-size:12.5px;margin-bottom:20px}' +
    'label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#8195ad;margin:12px 0 4px}' +
    'input{width:100%;padding:10px 12px;background:#0a131e;border:1px solid #1f2e42;border-radius:8px;color:#dbe7f5;font-size:14px}' +
    'input:focus{outline:none;border-color:#3fd0ff}' +
    'button{width:100%;margin-top:20px;padding:11px;background:#3fd0ff;color:#04141d;border:0;border-radius:8px;' +
    'font-size:14px;font-weight:700;cursor:pointer}button:hover{background:#5cd8ff}' +
    '.err{background:rgba(255,106,61,.12);border:1px solid #ff6a3d;color:#ff8a63;font-size:12.5px;padding:8px 10px;' +
    'border-radius:8px;margin-bottom:14px;text-align:center}' +
    '.foot{text-align:center;color:#5d7f9c;font-size:11px;margin-top:18px}</style></head><body>' +
    '<form class="card" method="POST" action="/login" autocomplete="off">' +
    '<div class="lock">🔒</div><h1>Secure Access</h1>' +
    '<div class="sub">Authorized personnel only. Sign in to continue.</div>' +
    (error ? '<div class="err">' + error + '</div>' : '') +
    '<label for="u">Username</label><input id="u" name="username" autofocus>' +
    '<label for="p">Password</label><input id="p" name="password" type="password">' +
    '<button type="submit">Sign in</button>' +
    '<div class="foot">Demonstration environment — not a production system.<br>This is a private system. Activity may be monitored.</div>' +
    '</form></body></html>';
}

function parseCookies(req) {
  const out = {}; const raw = req.headers.cookie || '';
  raw.split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
function authed(req) { const sid = parseCookies(req).sid; return sid && sessions.has(sid); }

function serveLogin(res, error) {
  res.writeHead(error ? 401 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(loginPage(error));
}

function handleLogin(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    const p = new URLSearchParams(body);
    if (p.get('username') === USER && p.get('password') === PASS) {
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.add(sid);
      res.writeHead(302, {
        'Set-Cookie': 'sid=' + sid + '; HttpOnly; SameSite=Strict; Path=/',
        'Location': '/index.html'
      });
      res.end();
    } else {
      serveLogin(res, 'Invalid username or password.');
    }
  });
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && url === '/login') return handleLogin(req, res);
  if (url === '/logout') {
    const sid = parseCookies(req).sid; if (sid) sessions.delete(sid);
    res.writeHead(302, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0', 'Location': '/login' });
    return res.end();
  }

  // GATE: anything without a valid session gets ONLY the neutral login page.
  if (!authed(req)) return serveLogin(res, null);

  // ── authenticated: serve static files ──
  let rel = decodeURIComponent(url);
  if (rel === '/' || rel === '' || rel === '/login') rel = '/index.html';   // main page = the simulation
  if (rel === '/testreport' || rel === '/testreport/') rel = '/testreport.html';   // live test runner endpoint
  if (rel === '/report' || rel === '/report/') rel = '/report.html';               // static report endpoint
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
  console.log('HydroManifold preview (form login) → http://' + HOST + ':' + PORT + '/');
  console.log('  sign in: ' + USER + ' / ' + PASS);
  console.log('  a neutral login page is shown first; nothing identifiable serves until signed in');
});
