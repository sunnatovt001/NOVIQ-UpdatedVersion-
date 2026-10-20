/**
 * NOVIQ Dynamic Environment-Aware URL Routing Utility (CommonJS)
 * Resolves application website URLs dynamically across Local, Vercel Preview, and Vercel Production.
 */

const VERIFIED_PRODUCTION_FALLBACK = 'https://noviq-delta.vercel.app';
const DEFAULT_LOCAL_URL = 'http://localhost:3000';
const UNVERIFIED_DOMAINS = new Set(['noviqq.uz']);

function normalizeUrl(rawUrl, defaultProtocol = 'https:') {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `${defaultProtocol.replace(/:?$/, ':')}//${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    const cleanUrl = `${parsed.origin}${cleanPath}${parsed.search}${parsed.hash}`;
    return cleanUrl.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isLocalUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
  } catch {
    return false;
  }
}

function isUnverifiedDomain(url, env = process.env) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const verifiedCustom = (env.VERIFIED_CUSTOM_DOMAIN || '').trim().toLowerCase();
    if (verifiedCustom && host === verifiedCustom) return false;
    if (env.ALLOW_UNVERIFIED_DOMAIN === 'true') return false;
    return UNVERIFIED_DOMAINS.has(host);
  } catch {
    return false;
  }
}

function isProductionEnv(env = process.env) {
  return (
    env.NODE_ENV === 'production' ||
    env.VERCEL_ENV === 'production' ||
    (env.VERCEL === '1' && env.VERCEL_ENV !== 'development')
  );
}

function getAppUrl(env = process.env) {
  const isProd = isProductionEnv(env);

  const explicitCandidates = [env.PUBLIC_APP_URL, env.APP_URL];
  for (const raw of explicitCandidates) {
    if (!raw) continue;
    const normalized = normalizeUrl(raw, isProd ? 'https:' : 'http:');
    if (!normalized) continue;

    if (isLocalUrl(normalized)) {
      if (isProd) {
        continue;
      }
      return normalized;
    }

    if (isUnverifiedDomain(normalized, env)) {
      continue;
    }

    return normalized;
  }

  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    const normalized = normalizeUrl(env.VERCEL_PROJECT_PRODUCTION_URL, 'https:');
    if (normalized && !isLocalUrl(normalized) && !isUnverifiedDomain(normalized, env)) {
      return normalized;
    }
  }

  if (env.VERCEL_URL) {
    const normalized = normalizeUrl(env.VERCEL_URL, 'https:');
    if (normalized && !isLocalUrl(normalized) && !isUnverifiedDomain(normalized, env)) {
      return normalized;
    }
  }

  if (isProd) {
    if (VERIFIED_PRODUCTION_FALLBACK) {
      return VERIFIED_PRODUCTION_FALLBACK;
    }
    throw new Error('CONFIGURATION_ERROR: No trustworthy public URL could be resolved in production.');
  }

  return DEFAULT_LOCAL_URL;
}

function getAppRouteUrl(routePath = '', env = process.env) {
  const base = getAppUrl(env);
  if (!routePath || routePath === '/') return base;
  const cleanPath = String(routePath).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return cleanPath ? `${base}/${cleanPath}` : base;
}

const getProfileUrl = (env = process.env) => getAppRouteUrl('profile', env);
const getPlannerUrl = (env = process.env) => getAppRouteUrl('planner', env);
const getFocusUrl = (env = process.env) => getAppRouteUrl('focus', env);
const getFlashcardsUrl = (env = process.env) => getAppRouteUrl('flashcards', env);
const getMetricsUrl = (env = process.env) => getAppRouteUrl('analytics', env);
const getAnalyticsUrl = (env = process.env) => getAppRouteUrl('analytics', env);
const getPricingUrl = (env = process.env) => getAppRouteUrl('pricing', env);
const getDashboardUrl = (env = process.env) => getAppRouteUrl('dashboard', env);

function getAppHost(env = process.env) {
  try {
    const url = getAppUrl(env);
    return new URL(url).host;
  } catch {
    return 'localhost:3000';
  }
}

function getTelegramBotDeepLink(botUsername, token) {
  const cleanUsername = String(botUsername || 'noviqq_bot').replace(/^@/, '').trim();
  const cleanToken = String(token || '').trim();
  if (cleanToken) {
    return `https://t.me/${cleanUsername}?start=link_${cleanToken}`;
  }
  return `https://t.me/${cleanUsername}`;
}

module.exports = {
  VERIFIED_PRODUCTION_FALLBACK,
  DEFAULT_LOCAL_URL,
  UNVERIFIED_DOMAINS,
  normalizeUrl,
  isLocalUrl,
  isUnverifiedDomain,
  isProductionEnv,
  getAppUrl,
  getAppRouteUrl,
  getProfileUrl,
  getPlannerUrl,
  getFocusUrl,
  getFlashcardsUrl,
  getMetricsUrl,
  getAnalyticsUrl,
  getPricingUrl,
  getDashboardUrl,
  getAppHost,
  getTelegramBotDeepLink,
};
