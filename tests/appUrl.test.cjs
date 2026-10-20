const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAppUrl,
  getAppRouteUrl,
  getProfileUrl,
  getPlannerUrl,
  getFocusUrl,
  getFlashcardsUrl,
  getPricingUrl,
  getDashboardUrl,
  getMetricsUrl,
  getAnalyticsUrl,
  getAppHost,
  getTelegramBotDeepLink,
  normalizeUrl,
  isLocalUrl,
  isUnverifiedDomain,
  VERIFIED_PRODUCTION_FALLBACK,
  DEFAULT_LOCAL_URL,
} = require('../server/src/appUrl.cjs');

test('appUrl - Local development URL resolution', () => {
  // Empty env defaults to localhost:3000
  assert.equal(getAppUrl({}), DEFAULT_LOCAL_URL);
  assert.equal(getAppUrl({ NODE_ENV: 'development' }), 'http://localhost:3000');

  // Explicit APP_URL or PUBLIC_APP_URL in dev
  assert.equal(getAppUrl({ APP_URL: 'http://localhost:3000' }), 'http://localhost:3000');
  assert.equal(getAppUrl({ PUBLIC_APP_URL: 'http://127.0.0.1:3000/' }), 'http://127.0.0.1:3000');

  // Unverified domain (noviqq.uz) in dev is ignored and falls back to localhost
  assert.equal(getAppUrl({ APP_URL: 'https://noviqq.uz', NODE_ENV: 'development' }), 'http://localhost:3000');
  assert.equal(getAppUrl({ PUBLIC_APP_URL: 'https://noviqq.uz/profile' }), 'http://localhost:3000');
});

test('appUrl - Local development route links', () => {
  const env = { APP_URL: 'http://localhost:3000' };

  assert.equal(getProfileUrl(env), 'http://localhost:3000/profile');
  assert.equal(getPlannerUrl(env), 'http://localhost:3000/planner');
  assert.equal(getFocusUrl(env), 'http://localhost:3000/focus');
  assert.equal(getFlashcardsUrl(env), 'http://localhost:3000/flashcards');
  assert.equal(getPricingUrl(env), 'http://localhost:3000/pricing');
  assert.equal(getDashboardUrl(env), 'http://localhost:3000/dashboard');
  assert.equal(getMetricsUrl(env), 'http://localhost:3000/analytics');
  assert.equal(getAnalyticsUrl(env), 'http://localhost:3000/analytics');
  assert.equal(getAppHost(env), 'localhost:3000');
});

test('appUrl - Vercel production priority and resolution', () => {
  const prodEnv = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' };

  // Priority 1: Explicit PUBLIC_APP_URL
  assert.equal(
    getAppUrl({ ...prodEnv, PUBLIC_APP_URL: 'https://learn.noviq.app' }),
    'https://learn.noviq.app'
  );

  // Priority 1: Explicit APP_URL
  assert.equal(
    getAppUrl({ ...prodEnv, APP_URL: 'https://study.noviq.com' }),
    'https://study.noviq.com'
  );

  // Priority 2: VERCEL_PROJECT_PRODUCTION_URL (auto-adds https://)
  assert.equal(
    getAppUrl({ ...prodEnv, VERCEL_PROJECT_PRODUCTION_URL: 'noviq-prod.vercel.app' }),
    'https://noviq-prod.vercel.app'
  );

  // Priority 3: VERCEL_URL (preview deployment)
  assert.equal(
    getAppUrl({ NODE_ENV: 'production', VERCEL: '1', VERCEL_URL: 'noviq-git-branch.vercel.app' }),
    'https://noviq-git-branch.vercel.app'
  );

  // Priority 4: Fallback verified production domain
  assert.equal(getAppUrl(prodEnv), VERIFIED_PRODUCTION_FALLBACK);
  assert.equal(getProfileUrl(prodEnv), `${VERIFIED_PRODUCTION_FALLBACK}/profile`);
  assert.equal(getAppHost(prodEnv), 'noviq-delta.vercel.app');
});

test('appUrl - Production security: never returns localhost in production', () => {
  const prodEnvWithLocalhost = {
    NODE_ENV: 'production',
    APP_URL: 'http://localhost:3000',
    PUBLIC_APP_URL: 'http://127.0.0.1:3000',
  };

  const resolved = getAppUrl(prodEnvWithLocalhost);
  assert.notEqual(resolved, 'http://localhost:3000');
  assert.notEqual(resolved, 'http://127.0.0.1:3000');
  assert.equal(resolved, VERIFIED_PRODUCTION_FALLBACK);
});

test('appUrl - Unverified noviqq.uz domain is rejected in production', () => {
  const prodEnvWithUnverified = {
    NODE_ENV: 'production',
    APP_URL: 'https://noviqq.uz',
    PUBLIC_APP_URL: 'https://noviqq.uz',
  };

  const resolved = getAppUrl(prodEnvWithUnverified);
  assert.notEqual(resolved, 'https://noviqq.uz');
  assert.equal(resolved, VERIFIED_PRODUCTION_FALLBACK);
});

test('appUrl - URL and route trailing slash normalization', () => {
  assert.equal(normalizeUrl('https://app.noviq.com///'), 'https://app.noviq.com');
  assert.equal(normalizeUrl('app.noviq.com/'), 'https://app.noviq.com');
  assert.equal(normalizeUrl('http://localhost:3000///'), 'http://localhost:3000');

  const env = { APP_URL: 'http://localhost:3000///' };
  assert.equal(getAppRouteUrl('/profile///', env), 'http://localhost:3000/profile///'.replace(/\/+$/, ''));
  assert.equal(getAppRouteUrl('planner', env), 'http://localhost:3000/planner');
  assert.equal(getAppRouteUrl('', env), 'http://localhost:3000');
  assert.equal(getAppRouteUrl('/', env), 'http://localhost:3000');
});

test('appUrl - Telegram Bot deep links use standard t.me format', () => {
  assert.equal(
    getTelegramBotDeepLink('noviqq_bot', 'token123abc'),
    'https://t.me/noviqq_bot?start=link_token123abc'
  );
  assert.equal(
    getTelegramBotDeepLink('@noviqq_bot', 'token456def'),
    'https://t.me/noviqq_bot?start=link_token456def'
  );
  assert.equal(
    getTelegramBotDeepLink('noviqq_bot'),
    'https://t.me/noviqq_bot'
  );
});
