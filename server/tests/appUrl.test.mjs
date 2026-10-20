import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  VERIFIED_PRODUCTION_FALLBACK,
  DEFAULT_LOCAL_URL,
} from '../src/appUrl.mjs';

test('appUrl (ESM) - Local development URL resolution', () => {
  assert.equal(getAppUrl({}), DEFAULT_LOCAL_URL);
  assert.equal(getAppUrl({ NODE_ENV: 'development' }), 'http://localhost:3000');
  assert.equal(getAppUrl({ APP_URL: 'http://localhost:3000' }), 'http://localhost:3000');
  assert.equal(getAppUrl({ PUBLIC_APP_URL: 'http://127.0.0.1:3000/' }), 'http://127.0.0.1:3000');

  // Unverified noviqq.uz domain in dev falls back to localhost:3000
  assert.equal(getAppUrl({ APP_URL: 'https://noviqq.uz' }), 'http://localhost:3000');
});

test('appUrl (ESM) - Local development route links', () => {
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

test('appUrl (ESM) - Vercel production priority', () => {
  const prodEnv = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' };

  // Explicit PUBLIC_APP_URL
  assert.equal(
    getAppUrl({ ...prodEnv, PUBLIC_APP_URL: 'https://learn.noviq.app' }),
    'https://learn.noviq.app'
  );

  // VERCEL_PROJECT_PRODUCTION_URL
  assert.equal(
    getAppUrl({ ...prodEnv, VERCEL_PROJECT_PRODUCTION_URL: 'noviq-prod.vercel.app' }),
    'https://noviq-prod.vercel.app'
  );

  // Fallback verified production domain
  assert.equal(getAppUrl(prodEnv), VERIFIED_PRODUCTION_FALLBACK);
  assert.equal(getProfileUrl(prodEnv), `${VERIFIED_PRODUCTION_FALLBACK}/profile`);
});

test('appUrl (ESM) - Production safety: rejects localhost and unverified domains', () => {
  assert.equal(
    getAppUrl({ NODE_ENV: 'production', APP_URL: 'http://localhost:3000' }),
    VERIFIED_PRODUCTION_FALLBACK
  );
  assert.equal(
    getAppUrl({ NODE_ENV: 'production', APP_URL: 'https://noviqq.uz' }),
    VERIFIED_PRODUCTION_FALLBACK
  );
});

test('appUrl (ESM) - Deep links and normalization', () => {
  assert.equal(
    getTelegramBotDeepLink('noviqq_bot', 'token999'),
    'https://t.me/noviqq_bot?start=link_token999'
  );
  assert.equal(normalizeUrl('https://app.noviq.com/path//'), 'https://app.noviq.com/path');
});
