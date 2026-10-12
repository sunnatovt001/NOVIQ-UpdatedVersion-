import { createAdminAuthorization } from './adminAuthorization.mjs';

function cookieToken(header) {
  if (typeof header !== 'string') return null;
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith('__Host-noviq_session='));
  return matches.length === 1 ? matches[0].slice('__Host-noviq_session='.length) : null;
}

export function createAdminApi(db, sessions) {
  const requireAdmin = createAdminAuthorization(db, sessions);
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    try {
      await requireAdmin(cookieToken(request.headers.cookie));
      if (request.method !== 'GET') return send(405, { error: 'Method not allowed.' });
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname !== '/api/admin/migration-status') return send(404, { error: 'Not found.' });
      const manifests = await db.collection('migration_manifests').find({}, {
        projection: { _id: 1, count: 1, verified: 1, readTime: 1 },
      }).sort({ readTime: -1 }).limit(10).maxTimeMS(5000).toArray();
      return send(200, { archives: manifests, applicationCutover: false });
    } catch (error) {
      const status = [401, 403].includes(error.status) ? error.status : 503;
      send(status, { error: status === 401 ? 'Authentication required.' : status === 403 ? 'Admin access required.' : 'Admin service unavailable.' });
    }
  };
}
