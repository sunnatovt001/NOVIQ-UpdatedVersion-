import { readSessionToken } from './authApi.mjs';
import { requireTrustedOrigin } from './sessions.mjs';
export const reject = status => Object.assign(new Error('Request rejected.'), { status });
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export async function jsonBody(request, limit = 512 * 1024) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw reject(415);
  let bytes = 0; const chunks = [];
  for await (const chunk of request) { bytes += chunk.length; if (bytes > limit) throw reject(413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw reject(400); }
}
export function studyEndpoint(sessions, origin, handler) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { response.statusCode = status; response.end(JSON.stringify(data)); };
    try {
      const user = await sessions.resolve(readSessionToken(request.headers.cookie));
      if (!user) throw reject(401);
      if (!['GET','HEAD'].includes(request.method)) {
        try { requireTrustedOrigin(request.headers.origin, origin); } catch { throw reject(403); }
      }
      await handler({ request, user, url: new URL(request.url, 'http://localhost'), send });
    } catch (error) {
      const status = [400,401,403,404,405,409,413,415,429].includes(error?.status) ? error.status : 503;
      send(status, { error: status === 409 ? 'Record changed. Reload before saving.' :
        status === 401 ? 'Authentication required.' : status === 503 ? 'Service unavailable.' : 'Request rejected.' });
    }
  };
}
