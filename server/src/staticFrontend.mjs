import fs from 'node:fs/promises';
import path from 'node:path';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json' };
export function createStaticFrontend(directory) {
  const root = path.resolve(directory);
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.statusCode = 405; response.end(); return; }
    let relative;
    try { relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.statusCode = 400; response.end(); return; }
    if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => part.startsWith('.') || part === '..')) {
      response.statusCode = 404; response.end(); return;
    }
    let filename = path.resolve(root, `.${relative}`);
    if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) { response.statusCode = 404; response.end(); return; }
    try {
      if (!(await fs.stat(filename)).isFile()) throw new Error();
    } catch {
      // Missing chunks/API paths must not return HTML masquerading as JS/JSON.
      if (relative.startsWith('/api/') || path.extname(relative)) { response.statusCode = 404; response.end(); return; }
      filename = path.join(root, 'index.html');
    }
    try {
      const data = await fs.readFile(filename);
      response.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Cache-Control', relative.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache');
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.statusCode = 503; response.end('Frontend build unavailable.'); }
  };
}
