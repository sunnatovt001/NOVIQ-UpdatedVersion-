const PRO_CONFIG = require('./pro-config.json');
const {membership,registerMembership} = require('./membership');
const AI_LIMITS = Object.freeze(Object.fromEntries(Object.entries(PRO_CONFIG.quotas.free).filter(([key])=>!['total','perMinute'].includes(key))));
const PRICES = Object.freeze(PRO_CONFIG.prices);
const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const hasPro = (subscription, now = Date.now()) => membership(subscription,now).entitled;
const sessionReward = (session, now = Date.now()) => {
  const duration = Number(session.duration);
  const ended = Date.parse(session.timestamp);
  if (
    !["focus", "revision", "quiz"].includes(session.category) ||
    !Number.isFinite(duration) ||
    duration < 60 ||
    duration > 28800 ||
    !Number.isFinite(ended) ||
    ended > now + 60000 ||
    ended < now - 7 * 86400000
  )
    return null;
  const xp =
    session.category === "quiz"
      ? 20
      : session.category === "revision"
        ? 15
        : Math.min(20, Math.floor(duration / 60));
  return { xp, duration, ended, started: ended - duration * 1000 };
};
const validCheckout = (checkout) =>
  checkout?.plan === "pro" &&
  ["click", "payme", "card"].includes(checkout.provider) &&
  Object.hasOwn(PRICES, checkout.billingCycle) &&
  checkout.amount === PRICES[checkout.billingCycle] &&
  checkout.currency === "UZS";
const nextBillingDate = (cycle, from = new Date()) => {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (cycle === "yearly" ? 12 : 1));
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
};
module.exports = {
  PRO_CONFIG, membership, registerMembership,
  AI_LIMITS,
  PRICES,
  dayKey,
  hasPro,
  sessionReward,
  validCheckout,
  nextBillingDate,
};
