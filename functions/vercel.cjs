const admin = require('firebase-admin');
const firebaseConfig = require('../firebase-applet-config.json');

let handlers;
function loadHandlers() {
  if (handlers) return handlers;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('BACKEND_NOT_CONFIGURED');
  const account = JSON.parse(raw);
  if (account.private_key && typeof account.private_key === 'string' && account.private_key.includes('\\n')) {
    account.private_key = account.private_key.replace(/\\n/g, '\n');
  }
  if (account.project_id !== firebaseConfig.projectId) throw new Error('FIREBASE_PROJECT_MISMATCH');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(account), projectId: account.project_id });
  handlers = require('./index.js');
  return handlers;
}

function createHandler(getHandlers = loadHandlers) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const sendError = (status, code, message) => res.status(status).json({ error: { status: code, message } });
    if (req.method !== 'POST') return sendError(405, 'INVALID_ARGUMENT', 'Use POST.');
    const name = req.query?.name;
    if (typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(name)) return sendError(404, 'NOT_FOUND', 'Unknown operation.');
    // Refuse unauthenticated calls before credentials, database or provider work.
    if (!/^Bearer \S+$/.test(req.headers.authorization || '')) return sendError(401, 'UNAUTHENTICATED', 'Sign in first.');
    if (Number(req.headers['content-length']) > 4 * 1024 * 1024) return sendError(413, 'INVALID_ARGUMENT', 'Request too large.');
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      try { req.body = JSON.parse(String(req.body)); } catch { return sendError(400, 'INVALID_ARGUMENT', 'Invalid JSON.'); }
    }
    if (!req.body || Buffer.byteLength(JSON.stringify(req.body)) > 4 * 1024 * 1024) return sendError(400, 'INVALID_ARGUMENT', 'Invalid or oversized request.');
    try {
      const api = getHandlers();
      const fn = Object.hasOwn(api, name) && api[name];
      // HTTP webhooks, event triggers and scheduled jobs must never be exposed.
      if (!fn?.__endpoint?.callableTrigger) return sendError(404, 'NOT_FOUND', 'Unknown operation.');
      req.header = req.header || (key => req.headers[key.toLowerCase()]);
      // Invoke the original Firebase HTTPS wrapper, which verifies the Firebase
      // ID token and decodes the callable protocol before the existing guards.
      return await fn(req, res);
    } catch {
      console.error('NOVIQ backend initialization failed.');
      return sendError(503, 'UNAVAILABLE', 'Backend temporarily unavailable.');
    }
  };
}

module.exports = { createHandler, loadHandlers };
