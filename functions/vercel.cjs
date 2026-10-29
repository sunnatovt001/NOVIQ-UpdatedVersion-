const admin = require('firebase-admin');
const firebaseConfig = require('../firebase-applet-config.json');

const configurationError = code => Object.assign(new Error(code), { code });

function createLoader(env = process.env, firebaseAdmin = admin, requireHandlers = () => require('./index.js')) {
 let handlers;
 return function loadHandlers() {
  if (handlers) return handlers;
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) throw configurationError('BACKEND_NOT_CONFIGURED');
  let account;
  try { account = JSON.parse(raw); } catch { throw configurationError('FIREBASE_CREDENTIAL_JSON_INVALID'); }
  if (!account || typeof account !== 'object' ||
      !['project_id', 'client_email', 'private_key'].every(key => typeof account[key] === 'string' && account[key].trim())) {
    throw configurationError('FIREBASE_CREDENTIAL_FIELDS_MISSING');
  }
  if (account.private_key && typeof account.private_key === 'string' && account.private_key.includes('\\n')) {
    account.private_key = account.private_key.replace(/\\n/g, '\n');
  }
  if (account.project_id !== firebaseConfig.projectId) throw configurationError('FIREBASE_PROJECT_MISMATCH');
  if (env.FIRESTORE_DATABASE && env.FIRESTORE_DATABASE !== firebaseConfig.firestoreDatabaseId) throw configurationError('FIRESTORE_DATABASE_MISMATCH');
  if (!firebaseAdmin.apps.some(app => app?.name === '[DEFAULT]') && !firebaseAdmin.apps.some(app => app?.name === undefined)) {
    let credential;
    try { credential = firebaseAdmin.credential.cert(account); } catch { throw configurationError('FIREBASE_PRIVATE_KEY_INVALID'); }
    firebaseAdmin.initializeApp({ credential, projectId: account.project_id });
  }
  handlers = requireHandlers();
  return handlers;
 };
}
const loadHandlers = createLoader();

const diagnostics = {
  BACKEND_NOT_CONFIGURED: 'Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel Production and redeploy.',
  FIREBASE_CREDENTIAL_JSON_INVALID: 'FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object, without outer shell quotes.',
  FIREBASE_CREDENTIAL_FIELDS_MISSING: 'Service account must contain project_id, client_email and private_key.',
  FIREBASE_PROJECT_MISMATCH: 'Use a service account for the frontend Firebase project.',
  FIRESTORE_DATABASE_MISMATCH: 'FIRESTORE_DATABASE must match firebase-applet-config.json firestoreDatabaseId.',
  FIREBASE_PRIVATE_KEY_INVALID: 'Use a valid PEM private_key from the Firebase service account JSON.',
};
function logBackendError(error, phase = 'rpc') {
  // Never log raw provider messages/stacks: they can contain keys, URLs or request data.
  const known = Object.hasOwn(diagnostics, error?.code);
  const code = known ? error.code : error?.code === 'MODULE_NOT_FOUND' ? 'BACKEND_MODULE_MISSING' : 'BACKEND_RUNTIME_FAILURE';
  console.error('NOVIQ backend failure', {
    phase, code,
    action: known ? diagnostics[code] : code === 'BACKEND_MODULE_MISSING'
      ? 'Verify npm ci --prefix functions and the function dependency bundle.'
      : 'Inspect the failing handler and provider configuration; no request data was logged.',
  });
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
    } catch (error) {
      logBackendError(error);
      return sendError(503, 'UNAVAILABLE', 'Backend temporarily unavailable.');
    }
  };
}

module.exports = { createHandler, loadHandlers, createLoader, logBackendError };
