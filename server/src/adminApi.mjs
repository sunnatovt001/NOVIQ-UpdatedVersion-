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
      if (pathname === '/api/admin/users') {
        const url = new URL(request.url, 'http://localhost');
        const cursor = url.searchParams.get('after');
        if (cursor !== null && (!cursor || cursor.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(cursor))) return send(400, { error: 'Invalid cursor.' });
        const rows = await db.collection('auth_accounts').find(cursor ? { _id: { $gt: cursor } } : {}, {
          projection: { _id: 1, email: 1, displayName: 1, emailVerified: 1, disabled: 1 },
        }).sort({ _id: 1 }).limit(51).maxTimeMS(5000).toArray();
        const users = rows.slice(0, 50).map(row => ({ uid: String(row._id),
          email: typeof row.email === 'string' ? row.email : null,
          displayName: typeof row.displayName === 'string' ? row.displayName : '',
          emailVerified: row.emailVerified === true, disabled: row.disabled === true }));
        return send(200, { users, nextCursor: rows.length > 50 ? users.at(-1).uid : null });
      }
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
