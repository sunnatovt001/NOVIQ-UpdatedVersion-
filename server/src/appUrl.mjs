/**
 * NOVIQ Dynamic Environment-Aware URL Routing Utility
 * Resolves application website URLs dynamically across Local, Vercel Preview, and Vercel Production.
 */

export const VERIFIED_PRODUCTION_FALLBACK = 'https://noviq-delta.vercel.app';
export const DEFAULT_LOCAL_URL = 'http://localhost:3000';
export const UNVERIFIED_DOMAINS = new Set(['noviqq.uz']);

/**
 * Normalizes an arbitrary candidate URL string:
 * - ensures http:// or https:// protocol
 * - strips trailing slashes
 * - validates URL syntax
 */
export function normalizeUrl(rawUrl, defaultProtocol = 'https:') {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Add default protocol if scheme is omitted (e.g. "noviq-delta.vercel.app")
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

/**
 * Determines whether a given URL is a local development address
 */
export function isLocalUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
  } catch {
    return false;
  }
}

/**
 * Determines whether the URL uses an unverified/broken domain
 */
export function isUnverifiedDomain(url, env = process.env) {
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

/**
 * Checks whether current environment is production or Vercel
 */
export function isProductionEnv(env = process.env) {
  return (
    env.NODE_ENV === 'production' ||
    env.VERCEL_ENV === 'production' ||
    (env.VERCEL === '1' && env.VERCEL_ENV !== 'development')
  );
}

/**
 * Resolves the base application URL based on environment variables and priority:
 * 1. Explicit PUBLIC_APP_URL or APP_URL
 * 2. VERCEL_PROJECT_PRODUCTION_URL
 * 3. VERCEL_URL (with https://)
 * 4. Verified production fallback (https://noviq-delta.vercel.app) if in production
 * 5. Default local dev URL (http://localhost:3000) if in development
 */
export function getAppUrl(env = process.env) {
  const isProd = isProductionEnv(env);

  // 1. Explicit PUBLIC_APP_URL or APP_URL
  const explicitCandidates = [env.PUBLIC_APP_URL, env.APP_URL];
  for (const raw of explicitCandidates) {
    if (!raw) continue;
    const normalized = normalizeUrl(raw, isProd ? 'https:' : 'http:');
    if (!normalized) continue;

    // Check if localhost
    if (isLocalUrl(normalized)) {
      if (isProd) {
        // Disallowed in production!
        continue;
      }
      return normalized;
    }

    // Check if unverified domain (e.g. unconfigured noviqq.uz)
    if (isUnverifiedDomain(normalized, env)) {
      continue;
    }

    return normalized;
  }

  // 2. VERCEL_PROJECT_PRODUCTION_URL
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    const normalized = normalizeUrl(env.VERCEL_PROJECT_PRODUCTION_URL, 'https:');
    if (normalized && !isLocalUrl(normalized) && !isUnverifiedDomain(normalized, env)) {
      return normalized;
    }
  }

  // 3. VERCEL_URL (Preview or deployment-specific)
  if (env.VERCEL_URL) {
    const normalized = normalizeUrl(env.VERCEL_URL, 'https:');
    if (normalized && !isLocalUrl(normalized) && !isUnverifiedDomain(normalized, env)) {
      return normalized;
    }
  }

  // 4. Production Fallback
  if (isProd) {
    if (VERIFIED_PRODUCTION_FALLBACK) {
      return VERIFIED_PRODUCTION_FALLBACK;
    }
    throw new Error('CONFIGURATION_ERROR: No trustworthy public URL could be resolved in production.');
  }

  // 5. Local Development Fallback
  return DEFAULT_LOCAL_URL;
}

/**
 * Builds a full URL for any specific route in NOVIQ:
 * Automatically normalizes route slashes (e.g. getAppRouteUrl('/profile') or getAppRouteUrl('profile'))
 */
export function getAppRouteUrl(routePath = '', env = process.env) {
  const base = getAppUrl(env);
  if (!routePath || routePath === '/') return base;
  const cleanPath = String(routePath).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return cleanPath ? `${base}/${cleanPath}` : base;
}

/**
 * Route-specific convenience helpers
 */
export const getProfileUrl = (env = process.env) => getAppRouteUrl('profile', env);
export const getPlannerUrl = (env = process.env) => getAppRouteUrl('planner', env);
export const getFocusUrl = (env = process.env) => getAppRouteUrl('focus', env);
export const getFlashcardsUrl = (env = process.env) => getAppRouteUrl('flashcards', env);
export const getMetricsUrl = (env = process.env) => getAppRouteUrl('analytics', env);
export const getAnalyticsUrl = (env = process.env) => getAppRouteUrl('analytics', env);
export const getPricingUrl = (env = process.env) => getAppRouteUrl('pricing', env);
export const getDashboardUrl = (env = process.env) => getAppRouteUrl('dashboard', env);

/**
 * Extracts clean domain host (without protocol or path) for display strings
 * e.g. "http://localhost:3000" -> "localhost:3000"
 * e.g. "https://noviq-delta.vercel.app" -> "noviq-delta.vercel.app"
 */
export function getAppHost(env = process.env) {
  try {
    const url = getAppUrl(env);
    return new URL(url).host;
  } catch {
    return 'localhost:3000';
  }
}

/**
 * Constructs Telegram Bot deep link:
 * Format: https://t.me/<bot_username>?start=link_<token>
 */
export function getTelegramBotDeepLink(botUsername, token) {
  const cleanUsername = String(botUsername || 'noviqq_bot').replace(/^@/, '').trim();
  const cleanToken = String(token || '').trim();
  if (cleanToken) {
    return `https://t.me/${cleanUsername}?start=link_${cleanToken}`;
  }
  return `https://t.me/${cleanUsername}`;
}
