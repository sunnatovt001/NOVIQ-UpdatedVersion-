const AI_LIMITS = Object.freeze({
  tutor: 5,
  notebook: 5,
  planner: 2,
  flashcards: 2,
});
const PRICES = Object.freeze({ monthly: 39000, yearly: 299000 });
const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const hasPro = (subscription, now = Date.now()) =>
  subscription?.plan === "pro" &&
  ["active", "trialing"].includes(subscription.status) &&
  Number.isFinite(Date.parse(subscription.currentPeriodEnd)) &&
  Date.parse(subscription.currentPeriodEnd) > now;
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
  AI_LIMITS,
  PRICES,
  dayKey,
  hasPro,
  sessionReward,
  validCheckout,
  nextBillingDate,
};
