/**
 * Local stand-in for the IIS layout, used ONLY to check the production builds under their real sub-paths before
 * they are copied to the server. It is NOT IIS: it does not test web.config, URL Rewrite or ARR.
 *
 *   node deploy/tools/simulate-iis.mjs [port] [apiPort]     (defaults 8080 and 3001)
 *
 *   /TNNHIS/       -> nhis-client/dist   (unknown paths fall back to its index.html)
 *   /TNNHISAdmin/  -> nhis-admin/dist    (same)
 *   /TNNHISApi/api/... -> http://127.0.0.1:<apiPort>/api/...   (only the /TNNHISApi prefix is removed)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] ?? 8080);
const apiPort = Number(process.argv[3] ?? 3001);
const apps = { '/TNNHIS': path.join(root, 'nhis-client', 'dist'), '/TNNHISAdmin': path.join(root, 'nhis-admin', 'dist') };
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf', '.config': 'text/plain',
};

function serveApp(prefix, dir, url, res) {
  const relative = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/^\/+/, '');
  const candidate = path.resolve(dir, relative);
  const inside = candidate === dir || candidate.startsWith(dir + path.sep);
  const isFile = inside && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  const file = isFile ? candidate : path.join(dir, 'index.html'); // application-relative SPA fallback
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/TNNHISApi/api/')) {
    const upstream = http.request({
      host: '127.0.0.1', port: apiPort, method: req.method, path: url.pathname.slice('/TNNHISApi'.length) + url.search,
      headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress ?? '' },
    }, (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); });
    upstream.on('error', () => { res.writeHead(502); res.end('Bad gateway'); });
    req.pipe(upstream);
    return;
  }
  for (const [prefix, dir] of Object.entries(apps)) {
    if (url.pathname === prefix) { res.writeHead(301, { Location: `${prefix}/` }); res.end(); return; }
    if (url.pathname.startsWith(`${prefix}/`)) { serveApp(prefix, dir, url, res); return; }
  }
  res.writeHead(404); res.end('Not found');
}).listen(port, '127.0.0.1', () => console.log(`IIS layout simulation on http://127.0.0.1:${port}  (API -> :${apiPort})`));
