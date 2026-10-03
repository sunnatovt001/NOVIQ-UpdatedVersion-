const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dayKey,
  hasPro,
  sessionReward,
  validCheckout,
  nextBillingDate,
} = require("./policy");

test("daily limits reset at Tashkent midnight", () => {
  assert.equal(dayKey(new Date("2026-10-02T18:59:59Z")), "2026-10-02");
  assert.equal(dayKey(new Date("2026-10-02T19:00:00Z")), "2026-10-03");
});
test("Pro requires a valid, unexpired billing period", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  assert.equal(hasPro({ plan: "pro", status: "active" }, now), false);
  assert.equal(
    hasPro({ plan: "pro", status: "active", currentPeriodEnd: "invalid" }, now),
    false,
  );
  assert.equal(
    hasPro(
      { plan: "pro", status: "active", currentPeriodEnd: "2026-10-02" },
      now,
    ),
    false,
  );
  assert.equal(
    hasPro(
      { plan: "pro", status: "active", currentPeriodEnd: "2026-11-03" },
      now,
    ),
    true,
  );
});
test("session XP is derived from duration, ignoring forged XP", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  assert.equal(
    sessionReward(
      {
        category: "focus",
        duration: 120,
        timestamp: new Date(now).toISOString(),
        xpEarned: 999999,
      },
      now,
    ).xp,
    2,
  );
  for (const duration of [0, -1, NaN, Infinity, 28801]) {
    assert.equal(
      sessionReward(
        { category: "focus", duration, timestamp: new Date(now).toISOString() },
        now,
      ),
      null,
    );
  }
  assert.equal(
    sessionReward(
      { category: "quiz", duration: 120, timestamp: "2030-01-01" },
      now,
    ),
    null,
  );
});
test("billing periods clamp month-end and leap days", () => {
  assert.equal(
    nextBillingDate("monthly", new Date("2026-01-31T10:30:00Z")).toISOString(),
    "2026-02-28T10:30:00.000Z",
  );
  assert.equal(
    nextBillingDate("yearly", new Date("2024-02-29T10:30:00Z")).toISOString(),
    "2025-02-28T10:30:00.000Z",
  );
});
test("checkout validation rejects underpayment and unknown providers", () => {
  const checkout = {
    plan: "pro",
    provider: "click",
    billingCycle: "monthly",
    amount: 39000,
    currency: "UZS",
  };
  assert.equal(validCheckout(checkout), true);
  for (const patch of [
    { amount: 1 },
    { currency: "USD" },
    { provider: "fake" },
    { billingCycle: "forever" },
  ]) {
    assert.equal(validCheckout({ ...checkout, ...patch }), false);
  }
});
