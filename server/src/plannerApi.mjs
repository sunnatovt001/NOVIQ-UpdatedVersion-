import { createHash } from 'node:crypto';
import { readSessionToken } from './authApi.mjs';
import { requireTrustedOrigin } from './sessions.mjs';

const fail = status => Object.assign(new Error('Planner request rejected.'), { status });
const text = value => typeof value === 'string';
const list = (value, limit, check) => Array.isArray(value) && value.length <= limit && value.every(check);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const allowed = new Set(['persistenceVersion','sequence','previousRevision','confirmedAt','version','userId','updatedAt','revision','startedAt','completedOnboardingAt','step','ready','statuses','timezone','subjects','windows','commitments','sessionMinutes','breakMinutes','dailyLimit','split','mode','preference','tasks','sessions','history']);
export function validMongoPlan(p, uid) {
  if (!record(p) || Object.keys(p).some(k => !allowed.has(k)) || p.version !== 2 || p.userId !== uid ||
      !text(p.revision) || !/^[A-Za-z0-9_-]{1,128}$/.test(p.revision) || !text(p.timezone)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: p.timezone }); } catch { return false; }
  const range = r => record(r) && text(r.id) && text(r.label) && list(r.days, 7, d => Number.isInteger(d) && d >= 0 && d <= 6) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(r.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.end);
  const unique = rows => new Set(rows.map(r => r.id)).size === rows.length;
  return Number.isFinite(p.startedAt) && Number.isFinite(p.updatedAt) && typeof p.ready === 'boolean' &&
    Number.isInteger(p.step) && p.step >= 0 && p.step <= 5 && typeof p.split === 'boolean' &&
    ['blocked','list','hybrid'].includes(p.mode) && ['morning','afternoon','evening'].includes(p.preference) &&
    Number.isFinite(p.sessionMinutes) && p.sessionMinutes > 0 && p.sessionMinutes <= 1440 &&
    Number.isFinite(p.breakMinutes) && p.breakMinutes >= 0 && p.breakMinutes <= 1440 &&
    Number.isFinite(p.dailyLimit) && p.dailyLimit >= 0 && p.dailyLimit <= 1440 &&
    list(p.statuses, 100, text) && list(p.history, 1000, record) &&
    list(p.subjects, 200, s => record(s) && text(s.id) && text(s.name) && ['self','tutor','hybrid'].includes(s.mode)) && unique(p.subjects) &&
    list(p.tasks, 2000, t => record(t) && text(t.id) && text(t.subjectId) && text(t.title) && Number.isFinite(t.minutes) && t.minutes >= 0 && Number.isFinite(t.createdAt)) && unique(p.tasks) &&
    list(p.windows, 300, range) && list(p.commitments, 300, range) &&
    list(p.sessions, 5000, s => record(s) && text(s.taskId) && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
}

export function createPlannerApi(db, sessions, { origin, now = () => Date.now() }) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    try {
      const user = await sessions.resolve(readSessionToken(request.headers.cookie));
      if (!user) throw fail(401);
      const url = new URL(request.url, 'http://localhost');
      if (!['/api/planner/plan','/api/planner/history'].includes(url.pathname)) throw fail(404);
      if (url.search) throw fail(400);
      const collection = db.collection('planner_plans');
      if (request.method === 'GET') {
        const row = await collection.findOne({ _id: user.uid }, { maxTimeMS: 5000 });
        return send(200, url.pathname.endsWith('/history') ? { revisions: (row?.history || []).slice(-12).reverse() } : { plan: row?.plan || null });
      }
      if (request.method !== 'PUT' || url.pathname.endsWith('/history')) throw fail(405);
      try { requireTrustedOrigin(request.headers.origin, origin); } catch { throw fail(403); }
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw fail(415);
      let bytes = 0; const chunks = [];
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 512 * 1024) throw fail(413); chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400); }
      if (!record(body) || Object.keys(body).some(k => !['plan','baseRevision','description'].includes(k)) ||
          !(body.baseRevision === null || text(body.baseRevision) && /^[A-Za-z0-9_-]{1,128}$/.test(body.baseRevision)) ||
          !text(body.description) || body.description.length > 200 || !validMongoPlan(body.plan, user.uid)) throw fail(400);
      const hash = createHash('sha256').update(JSON.stringify([body.baseRevision, body.plan, body.description])).digest('hex');
      const previous = await collection.findOne({ _id: user.uid }, { maxTimeMS: 5000 });
      if (previous?.plan.revision === body.plan.revision) {
        if (previous.mutationHash !== hash) throw fail(409);
        return send(200, { plan: previous.plan });
      }
      if ((previous?.plan.revision || null) !== body.baseRevision) throw fail(409);
      if (previous?.history?.some(item => item.id === body.plan.revision)) throw fail(409);
      const timestamp = now(), plan = { ...body.plan, persistenceVersion: 3, sequence: (previous?.plan.sequence || 0) + 1,
        previousRevision: body.baseRevision, updatedAt: timestamp };
      delete plan.confirmedAt;
      if (plan.ready) plan.confirmedAt = previous?.plan.confirmedAt || timestamp;
      const history = previous?.plan.ready || previous?.plan.completedOnboardingAt
        ? [...(previous.history || []), { id: plan.revision, userId: user.uid, createdAt: timestamp, description: body.description, plan: previous.plan }]
        : previous?.history || [];
      const row = { _id: user.uid, plan, history, mutationHash: hash };
      // Preserve immutable history; never discard old revisions to make a write fit.
      // A future transaction-backed history collection can remove this safety cap.
      if (Buffer.byteLength(JSON.stringify(row)) > 8 * 1024 * 1024) throw fail(413);
      if (!previous) {
        try { await collection.insertOne(row); } catch (error) { if (error.code === 11000) throw fail(409); throw error; }
        return send(201, { plan });
      }
      const changed = await collection.replaceOne({ _id: user.uid, 'plan.revision': body.baseRevision }, row);
      if (changed.modifiedCount !== 1) throw fail(409);
      return send(200, { plan });
    } catch (error) {
      const status = [400,401,403,404,405,409,413,415].includes(error?.status) ? error.status : 503;
      send(status, { error: status === 409 ? 'Planner revision changed. Reload before saving.' : status === 401 ? 'Authentication required.' : 'Planner request failed.' });
    }
  };
}
