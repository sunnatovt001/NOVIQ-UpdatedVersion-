const admin = require("firebase-admin");
const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const { logger, setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const {
  onCall,
  onRequest,
  HttpsError,
} = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const {
  AI_LIMITS,
  PRICES,
  dayKey,
  hasPro,
  sessionReward,
  validCheckout,
  nextBillingDate,
} = require("./policy");

admin.initializeApp();

const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const FIRESTORE_DATABASE =
  process.env.FIRESTORE_DATABASE ||
  "ai-studio-b3129ca2-3cf9-4d3f-bf24-5a6d266fe7a1";
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const TELEGRAM_TIME_ZONE = "Asia/Tashkent";

setGlobalOptions({ region: REGION, maxInstances: 10 });

const db = getFirestore(FIRESTORE_DATABASE);

const LEVELS = [
  { level: 1, minXp: 0, name: "Novice Student" },
  { level: 2, minXp: 100, name: "Active Student" },
  { level: 3, minXp: 250, name: "Knowledge Builder" },
  { level: 4, minXp: 500, name: "Scholar" },
  { level: 5, minXp: 1000, name: "Master Scholar" },
  { level: 10, minXp: 5000, name: "Academic Legend" },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const telegramDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TELEGRAM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.seconds === "number") {
    const parsed = new Date(value.seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const dayDistance = (from, to) =>
  Math.round((Date.parse(dayKey(to)) - Date.parse(dayKey(from))) / MS_PER_DAY);

const getLocalDayKey = (value = new Date()) => {
  const date = toDate(value) || new Date();
  return dayKey(date);
};

const getTelegramDayKey = (value = new Date()) =>
  telegramDateFormatter.format(toDate(value) || new Date());

const isValidTelegramChatId = (value) =>
  /^-?\d{5,32}$/.test(String(value || "").trim());

const isNotificationPreferenceEnabled = (user, key) =>
  user?.settings?.notifications?.[key] !== false;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELS = [
  ...String(process.env.GEMINI_MODELS || "gemini-3.8-flash").split(",").map((model) => model.trim()).filter((model) => /^[a-zA-Z0-9._-]+$/.test(model)),
];

const normalizeGeminiContents = (contents) => {
  if (typeof contents === "string") {
    return [{ role: "user", parts: [{ text: contents }] }];
  }
  if (Array.isArray(contents)) return contents;
  throw new HttpsError("invalid-argument", "Invalid AI contents.");
};

const normalizeGeminiConfig = (config) => {
  if (!config || typeof config !== "object") return {};
  const { systemInstruction, responseMimeType, responseSchema } = config;
  return {
    systemInstruction:
      typeof systemInstruction === "string" ? systemInstruction : undefined,
    generationConfig: {
      maxOutputTokens: 8192,
      ...(typeof responseMimeType === "string" ? { responseMimeType } : {}),
      ...(responseSchema && typeof responseSchema === "object"
        ? { responseSchema }
        : {}),
    },
  };
};

const extractGeminiText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part.text || "")
    .join("")
    .trim();
};

const callGeminiRest = async ({ model, contents, config }) => {
  if (!GEMINI_API_KEY) {
    throw new HttpsError("failed-precondition", "MISSING_GEMINI_API_KEY");
  }

  const normalizedConfig = normalizeGeminiConfig(config);
  const body = {
    contents: normalizeGeminiContents(contents),
    ...(normalizedConfig.systemInstruction
      ? {
          systemInstruction: {
            parts: [{ text: normalizedConfig.systemInstruction }],
          },
        }
      : {}),
    ...(Object.keys(normalizedConfig.generationConfig || {}).length
      ? { generationConfig: normalizedConfig.generationConfig }
      : {}),
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Gemini request failed with ${response.status}`;
    throw new Error(`Gemini HTTP ${response.status}: ${String(message).replaceAll(GEMINI_API_KEY, "[redacted]")}`);
  }

  const text = extractGeminiText(payload);
  if (!text) throw new Error("EMPTY_AI_RESPONSE");
  return text;
};

const compactTaskLabel = (task) => {
  const label = String(
    task?.label || task?.title || task?.section || "Study task",
  ).trim();
  const minutes = Number(task?.minutes || task?.duration || 0);
  return minutes > 0 ? `${label} (${minutes} min)` : label;
};

const sendTelegramMessage = async (chatId, text) => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: String(text).slice(0, 4096),
        disable_web_page_preview: true,
      }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(
      result.description || `Telegram send failed with ${response.status}`,
    );
  }
  return result;
};

const getAiFailureDetails = (error) => {
  const message = String(
    error?.message || error || "AI service failed to answer.",
  ).slice(0, 500);
  const lower = message.toLowerCase();
  let reason = "AI_PROVIDER_UNAVAILABLE";

  if (
    lower.includes("quota") ||
    lower.includes("rate") ||
    lower.includes("429")
  ) {
    reason = "AI_QUOTA_OR_RATE_LIMIT";
  } else if (
    lower.includes("api key") ||
    lower.includes("permission") ||
    lower.includes("403") || lower.includes("401") || lower.includes("unauthenticated")
  ) {
    reason = "AI_KEY_OR_PERMISSION";
  } else if (
    lower.includes("model") ||
    lower.includes("not found") ||
    lower.includes("404")
  ) {
    reason = "AI_MODEL_UNAVAILABLE";
  } else if (
    lower.includes("mime") ||
    lower.includes("unsupported") ||
    lower.includes("file type")
  ) {
    reason = "AI_UNSUPPORTED_FILE";
  } else if (
    lower.includes("invalid") ||
    lower.includes("400") ||
    lower.includes("bad request")
  ) {
    reason = "AI_REQUEST_REJECTED";
  }

  if (/timeout|timed out|aborted/i.test(message)) reason = "AI_TIMEOUT";
  if (message.includes("EMPTY_AI_RESPONSE")) reason = "AI_EMPTY_RESPONSE";

  return { reason, message: GEMINI_API_KEY ? message.replaceAll(GEMINI_API_KEY, "[redacted]") : message };
};

const throwAiFailure = (error) => {
  if (error instanceof HttpsError) throw error;
  const details = getAiFailureDetails(error);
  throw new HttpsError("unavailable", details.reason, details);
};

const buildTelegramDailySummary = async (userId, user) => {
  const todayKey = getTelegramDayKey();
  const plannerSnap = await db.doc(`users/${userId}/planner/state`).get();
  const planner = plannerSnap.exists ? plannerSnap.data()?.state || {} : {};
  const tasks =
    planner.missionDate === todayKey && Array.isArray(planner.tasks)
      ? planner.tasks
      : [];
  const progress =
    planner.taskProgress && typeof planner.taskProgress === "object"
      ? planner.taskProgress
      : {};
  const completedTasks = tasks.filter(
    (task) => progress[task.id]?.status === "completed",
  );
  const pendingTasks = tasks.filter(
    (task) => progress[task.id]?.status !== "completed",
  );
  const totalMinutes = tasks.reduce(
    (total, task) => total + (Number(task.minutes || task.duration) || 0),
    0,
  );
  const completedMinutes = completedTasks.reduce(
    (total, task) => total + (Number(task.minutes || task.duration) || 0),
    0,
  );
  const lastStudyToday =
    getTelegramDayKey(user.lastStudySessionAt || user.lastActive) === todayKey;
  const name = String(user.displayName || "Noviq student").trim();
  const streak = Math.max(0, Number(user.streak) || 0);

  const lines = [`Noviq daily check`, `Hi ${name}, bugungi holat:`];

  if (tasks.length) {
    lines.push(
      `Progress: ${completedTasks.length}/${tasks.length} task, ${completedMinutes}/${totalMinutes} min.`,
    );
    lines.push("");
    lines.push("Qilingan:");
    lines.push(
      completedTasks.length
        ? completedTasks
            .slice(0, 4)
            .map((task) => `- ${compactTaskLabel(task)}`)
            .join("\n")
        : "- Hali verified task yo'q.",
    );
    lines.push("");
    lines.push("Qolgan:");
    lines.push(
      pendingTasks.length
        ? pendingTasks
            .slice(0, 4)
            .map((task) => `- ${compactTaskLabel(task)}`)
            .join("\n")
        : "- Hammasi bajarildi.",
    );
  } else {
    lines.push("Bugun AI Planner missiyasi yaratilmagan.");
    lines.push("Noviqni ochib bugungi qisqa missionni yaratib oling.");
  }

  lines.push("");
  lines.push(`Study session today: ${lastStudyToday ? "yes" : "no"}.`);
  lines.push(`Streak: ${streak} day${streak === 1 ? "" : "s"}.`);
  lines.push(
    pendingTasks.length
      ? "Bironta qisqa taskni yopib qo'ying."
      : "Bugungi ritm yaxshi yopildi.",
  );

  return lines.join("\n");
};

const getNextStreak = (
  currentStreak = 0,
  lastActive,
  activeAt = new Date(),
) => {
  const lastActiveDate = toDate(lastActive);
  if (!lastActiveDate || currentStreak <= 0) return 1;
  const distance = dayDistance(lastActiveDate, activeAt);
  if (distance <= 0) return currentStreak;
  return distance === 1 ? currentStreak + 1 : 1;
};

const calculateLevelInfo = (xp) =>
  LEVELS.reduce(
    (current, level) => (xp >= level.minXp ? level : current),
    LEVELS[0],
  );

const xpForAwardKey = (key) => {
  if (!key || typeof key !== "string") return 0;
  if (key.startsWith("daily-login:")) return 5;
  if (key.startsWith("daily-goal:")) return 20;
  if (key.startsWith("streak-7:")) return 50;
  if (key.startsWith("streak-30:")) return 300;
  return 0;
};

const buildSubscription = ({
  billingCycle = "monthly",
  provider = "card",
  checkoutId,
}) => {
  const now = new Date();
  const currentPeriodEnd = nextBillingDate(billingCycle, now);

  return {
    plan: "pro",
    status: "active",
    billingCycle,
    provider,
    checkoutId,
    startedAt: now.toISOString(),
    currentPeriodEnd: currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: false,
    verifiedAt: now.toISOString(),
  };
};

const assertAdmin = async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  if (request.auth.token?.admin === true) {
    return;
  }

  const caller = await db.doc(`users/${request.auth.uid}`).get();
  if (caller.exists && caller.data()?.isAdmin === true) {
    return;
  }

  throw new HttpsError("permission-denied", "Admin access required.");
};

const processProgressEvent = async (userId, eventId) => {
  const userRef = db.doc(`users/${userId}`);
  const eventRef = userRef.collection("progressEvents").doc(eventId);
  const trustedProgressRef = userRef.collection("trusted").doc("progress");

  logger.info("Processing progress event", { userId, eventId });

  await db.runTransaction(async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists) {
      logger.warn("Progress event missing during processing", {
        userId,
        eventId,
      });
      return;
    }

    const eventData = eventSnap.data() || {};
    if (eventData.processedAt) {
      logger.info("Progress event already processed", { userId, eventId });
      return;
    }

    if (
      !["daily_activity", "xp_award", "study_session"].includes(eventData.type)
    ) {
      logger.warn("Rejected progress event with invalid type", {
        userId,
        eventId,
        type: eventData.type,
      });
      transaction.set(
        eventRef,
        {
          status: "rejected",
          rejectedAt: FieldValue.serverTimestamp(),
          rejectionReason: "invalid_type",
          processedBy: "noviq-functions",
        },
        { merge: true },
      );
      return;
    }

    const userSnap = await transaction.get(userRef);
    const user = userSnap.exists ? userSnap.data() || {} : {};
    const trustedProgressSnap = await transaction.get(trustedProgressRef);
    const trustedProgress = trustedProgressSnap.exists
      ? trustedProgressSnap.data() || {}
      : {};

    let rawXp = 0;
    let totalStudySecondsDelta = 0;
    let activeAt = toDate(eventData.createdAt) || new Date();
    let sessionId = eventData.sessionId;
    let shouldUpdateLastStudySession = false;
    let claimedSessionEnd = null;
    const today = dayKey();
    const dailySeconds =
      trustedProgress.dayKey === today
        ? Number(trustedProgress.dailyStudySeconds) || 0
        : 0;

    if (eventData.type === "study_session" && sessionId) {
      const sessionRef = userRef
        .collection("studySessions")
        .doc(String(sessionId));
      const sessionSnap = await transaction.get(sessionRef);
      const session = sessionSnap.exists ? sessionSnap.data() || {} : {};
      if (
        !sessionSnap.exists ||
        session.userId !== userId ||
        session.verified !== true ||
        eventId !== `session-${sessionId}`
      ) {
        logger.warn("Rejected progress event with invalid session", {
          userId,
          eventId,
          sessionId,
          sessionExists: sessionSnap.exists,
          sessionUserId: session.userId,
        });
        transaction.set(
          eventRef,
          {
            status: "rejected",
            rejectedAt: FieldValue.serverTimestamp(),
            processedAt: FieldValue.serverTimestamp(),
            rejectionReason: "invalid_session",
            processedBy: "noviq-functions",
          },
          { merge: true },
        );
        return;
      }
      const reward = sessionReward(session);
      // Canonical event IDs and server-issued sessions deduplicate each reward.
      // Firestore triggers can arrive out of order, so never reject older valid
      // sessions just because a later session was processed first.
      if (!reward || dailySeconds + reward.duration > 28800) {
        transaction.set(
          eventRef,
          {
            status: "rejected",
            processedAt: FieldValue.serverTimestamp(),
            rejectionReason: "invalid_session_or_daily_cap",
          },
          { merge: true },
        );
        return;
      }
      rawXp = reward.xp;
      totalStudySecondsDelta = reward.duration;
      claimedSessionEnd = new Date(reward.ended);
      activeAt = new Date();
      shouldUpdateLastStudySession = true;
    } else if (eventData.type === "xp_award") {
      // Arbitrary client raw XP and award names are never trusted.
      // A flashcard review can earn one bounded daily reward when a deck exists.
      if (eventData.activity === "flashcard_review") {
        const decks = await transaction.get(
          userRef.collection("decks").limit(1),
        );
        if (!decks.empty) rawXp = 15;
      }
    }

    const xpAwarded = { ...(user.xpAwarded || {}) };
    let awardXp = 0;
    activeAt = new Date();
    const nextDailySeconds = dailySeconds + totalStudySecondsDelta;
    const serverAwards = [`daily-login:${today}`];
    const serverStreak = getNextStreak(
      Number(trustedProgress.streak) || 0,
      trustedProgress.lastActive,
      activeAt,
    );
    if (serverStreak === 7) serverAwards.push(`streak-7:${today}`);
    if (serverStreak === 30) serverAwards.push(`streak-30:${today}`);
    if (nextDailySeconds >= clamp(user.dailyTargetMinutes || 30, 1, 480) * 60)
      serverAwards.push(`daily-goal:${today}`);
    if (eventData.activity === "flashcard_review") {
      const reviewKey = `flashcard-review:${today}`;
      if (xpAwarded[reviewKey]) rawXp = 0;
      else if (rawXp > 0) xpAwarded[reviewKey] = true;
    }
    for (const key of serverAwards) {
      if (xpAwarded[key]) continue;
      const value = xpForAwardKey(key);
      if (value <= 0) continue;
      xpAwarded[key] = true;
      awardXp += value;
    }

    const xpDelta = rawXp + awardXp;
    const currentXp = Math.max(0, Number(trustedProgress.xp ?? user.xp) || 0);
    const nextXp = currentXp + xpDelta;
    const levelInfo = calculateLevelInfo(nextXp);
    const currentTotalStudySeconds = Math.max(
      0,
      Number(trustedProgress.totalStudySeconds ?? user.totalStudySeconds) || 0,
    );
    const currentStreak = Number(trustedProgress.streak ?? user.streak) || 0;
    const currentLastActive = trustedProgress.lastActive ?? user.lastActive;
    const lastActive = toDate(currentLastActive);
    const nextLastActive =
      !lastActive || activeAt.getTime() >= lastActive.getTime()
        ? activeAt
        : lastActive || activeAt;
    const nextStreak =
      !lastActive || activeAt.getTime() >= lastActive.getTime()
        ? getNextStreak(currentStreak, currentLastActive, activeAt)
        : currentStreak;
    const existingSessionEnd = toDate(
      trustedProgress.lastStudySessionAt ?? user.lastStudySessionAt,
    );
    const nextLastStudySessionAt = shouldUpdateLastStudySession
      ? new Date(
          Math.max(
            claimedSessionEnd.getTime(),
            existingSessionEnd?.getTime() || 0,
          ),
        )
      : toDate(trustedProgress.lastStudySessionAt ?? user.lastStudySessionAt);
    const trustedPatch = {
      xp: nextXp,
      level: levelInfo.level,
      levelName: levelInfo.name,
      streak: nextStreak,
      totalStudySeconds: currentTotalStudySeconds + totalStudySecondsDelta,
      dayKey: today,
      dailyStudySeconds: nextDailySeconds,
      lastActive: Timestamp.fromDate(nextLastActive),
      lastStudySessionAt: nextLastStudySessionAt
        ? Timestamp.fromDate(nextLastStudySessionAt)
        : null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const userProgressMirror = {
      xp: trustedPatch.xp,
      level: trustedPatch.level,
      levelName: trustedPatch.levelName,
      xpAwarded,
      streak: trustedPatch.streak,
      totalStudySeconds: trustedPatch.totalStudySeconds,
      lastActive: nextLastActive.toISOString(),
      lastStudySessionAt: nextLastStudySessionAt
        ? nextLastStudySessionAt.toISOString()
        : null,
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(trustedProgressRef, trustedPatch, { merge: true });
    transaction.set(userRef, userProgressMirror, { merge: true });
    transaction.set(
      eventRef,
      {
        status: "processed",
        processedAt: FieldValue.serverTimestamp(),
        processedBy: "noviq-functions",
        xpDelta,
        rawXpApplied: rawXp,
        awardXpApplied: awardXp,
        syncStatus: "synced",
      },
      { merge: true },
    );

    logger.info("Trusted progress updated", {
      userId,
      eventId,
      eventType: eventData.type,
      xpDelta,
      rawXp,
      awardXp,
      nextXp,
      level: levelInfo.level,
      streak: trustedPatch.streak,
      totalStudySeconds: trustedPatch.totalStudySeconds,
      trustedPath: `users/${userId}/trusted/progress`,
    });
  });
};

exports.startStudySession = onCall(async (request) => {
  if (!request.auth?.uid)
    throw new HttpsError("unauthenticated", "Sign in first.");
  const category = request.data?.category;
  if (!["focus", "revision", "quiz"].includes(category))
    throw new HttpsError("invalid-argument", "Invalid session category.");
  const context = request.data?.context || "focus";
  if (typeof context !== "string" || context.length > 200)
    throw new HttpsError("invalid-argument", "Invalid session context.");
  const key = createHash("sha256").update(context).digest("hex");
  const ref = db.doc(`users/${request.auth.uid}/trusted/session-${key}`);
  const rateRef = db.doc(`users/${request.auth.uid}/trusted/sessionRate`);
  return db.runTransaction(async (transaction) => {
    const [snapshot, userSnap, rateSnap] = await Promise.all([
      transaction.get(ref),
      transaction.get(db.doc(`users/${request.auth.uid}`)),
      transaction.get(rateRef),
    ]);
    if (!userSnap.exists)
      throw new HttpsError("failed-precondition", "Create your profile first.");
    const prior = snapshot.data() || {};
    const rate = rateSnap.data() || {};
    const count = rate.dayKey === dayKey() ? Number(rate.count) || 0 : 0;
    if (
      !request.data?.restart &&
      prior.id &&
      !prior.completed &&
      prior.category === category &&
      Date.now() - (toDate(prior.startedAt)?.getTime() || 0) < 8 * 3600000
    )
      return { sessionId: prior.id, resumed: true };
    if (count >= 100)
      throw new HttpsError(
        "resource-exhausted",
        "Daily session limit reached. Try again tomorrow.",
      );
    const id = randomBytes(16).toString("hex");
    const proof = {
      id,
      category,
      startedAt: Timestamp.now(),
      completed: false,
      contextKey: key,
    };
    transaction.set(ref, proof);
    transaction.create(
      db.doc(`users/${request.auth.uid}/trusted/start-${id}`),
      proof,
    );
    transaction.set(rateRef, { dayKey: dayKey(), count: count + 1 });
    return { sessionId: id, resumed: false };
  });
});

exports.completeStudySession = onCall(async (request) => {
  if (!request.auth?.uid)
    throw new HttpsError("unauthenticated", "Sign in first.");
  const { sessionId, duration, subject } = request.data || {};
  if (
    !/^[a-f0-9]{32}$/.test(sessionId) ||
    !Number.isFinite(duration) ||
    duration < 60 ||
    duration > 28800 ||
    typeof subject !== "string" ||
    subject.length > 200
  )
    throw new HttpsError("invalid-argument", "Invalid study session.");
  const userRef = db.doc(`users/${request.auth.uid}`);
  let activeRef = userRef.collection("trusted").doc(`start-${sessionId}`);
  const sessionRef = userRef.collection("studySessions").doc(sessionId);
  await db.runTransaction(async (transaction) => {
    let [activeSnap, sessionSnap] = await Promise.all([
      transaction.get(activeRef),
      transaction.get(sessionRef),
    ]);
    if (sessionSnap.exists) return;
    if (!activeSnap.exists) {
      activeRef = userRef.collection("trusted").doc("activeSession");
      activeSnap = await transaction.get(activeRef);
    }
    const pointerRef = activeSnap.data()?.contextKey
      ? userRef
          .collection("trusted")
          .doc(`session-${activeSnap.data().contextKey}`)
      : null;
    const pointerSnap = pointerRef ? await transaction.get(pointerRef) : null;
    const clockRef = userRef.collection("trusted").doc("sessionClock");
    const clockSnap = await transaction.get(clockRef);
    const clock = clockSnap.data() || {};
    const active = activeSnap.data() || {};
    const started = toDate(active.startedAt)?.getTime();
    const now = Date.now();
    if (
      active.id !== sessionId ||
      active.completed ||
      !started ||
      now - started > 8 * 3600000
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Start a new study session first.",
      );
    }
    const clockStart =
      clock.dayKey === dayKey()
        ? Math.min(started, Number(clock.startedAt) || started)
        : started;
    const credited =
      clock.dayKey === dayKey() ? Number(clock.creditedSeconds) || 0 : 0;
    const seconds = Math.min(
      Math.floor(duration),
      Math.floor((now - started) / 1000),
      Math.max(0, Math.floor((now - clockStart) / 1000) - credited),
    );
    if (seconds < 60)
      throw new HttpsError(
        "failed-precondition",
        seconds < 60 && now - started >= 60000
          ? "Another timer has already recorded this time. Continue studying for at least one more minute."
          : "Study for at least one minute before completing.",
      );
    const session = {
      userId: request.auth.uid,
      duration: seconds,
      subject,
      category: active.category,
      timestamp: new Date(now).toISOString(),
      createdAt: FieldValue.serverTimestamp(),
      syncStatus: "synced",
      verified: true,
    };
    session.xpEarned = sessionReward(session, now).xp;
    transaction.set(clockRef, {
      dayKey: dayKey(),
      startedAt: clockStart,
      creditedSeconds: credited + seconds,
    });
    transaction.create(sessionRef, session);
    transaction.update(activeRef, { completed: true });
    if (pointerRef && pointerSnap.data()?.id === sessionId)
      transaction.update(pointerRef, { completed: true });
  });
  return { sessionId };
});

exports.onStudySessionCreated = onDocumentCreated(
  {
    document: "users/{userId}/studySessions/{sessionId}",
    database: FIRESTORE_DATABASE,
    retry: true,
  },
  async (event) => {
    const { userId, sessionId } = event.params;
    const eventRef = db.doc(
      `users/${userId}/progressEvents/session-${sessionId}`,
    );
    try {
      await eventRef.create({
        type: "study_session",
        sessionId,
        createdAt: FieldValue.serverTimestamp(),
        source: "studySessionTrigger",
        status: "pending",
      });
      logger.info("Created progress event from study session", {
        userId,
        sessionId,
        eventPath: `users/${userId}/progressEvents/session-${sessionId}`,
      });
    } catch (error) {
      if (error.code !== 6 && error.code !== "already-exists") {
        logger.warn("Could not create session progress event", {
          userId,
          sessionId,
          error,
        });
        throw error;
      } else {
        logger.info("Session progress event already exists", {
          userId,
          sessionId,
        });
        await processProgressEvent(userId, `session-${sessionId}`);
      }
    }
  },
);

exports.onProgressEventCreated = onDocumentCreated(
  {
    document: "users/{userId}/progressEvents/{eventId}",
    database: FIRESTORE_DATABASE,
    retry: true,
  },
  async (event) => {
    try {
      await processProgressEvent(event.params.userId, event.params.eventId);
    } catch (error) {
      logger.error("Progress event processing failed", {
        userId: event.params.userId,
        eventId: event.params.eventId,
        error,
      });
      throw error;
    }
  },
);

exports.onAnalyticsEventCreated = onDocumentCreated(
  {
    document: "analyticsEvents/{eventId}",
    database: FIRESTORE_DATABASE,
    retry: true,
  },
  async (event) => {
    const eventRef = event.data?.ref;
    if (!eventRef) return;
    await db.runTransaction(async (transaction) => {
      const currentEvent = await transaction.get(eventRef);
      const data = currentEvent.data() || {};
      if (!currentEvent.exists || data.processedAt) return;

      const userId = String(data.userId || "");
      const eventType = /^[a-z_]{1,64}$/.test(data.eventType)
        ? data.eventType
        : "unknown";
      const xp = 0; // XP totals belong to trusted progress, not client analytics.
      const details =
        data.details && typeof data.details === "object" ? data.details : {};

      const summaryRef = db.doc("analytics/summary");
      const userRef = userId ? db.doc(`analyticsUsers/${userId}`) : null;

      const summaryPatch = {
        totalEvents: FieldValue.increment(1),
        lastEventType: eventType,
        eventCounts: { [eventType]: FieldValue.increment(1) },
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (eventType === "site_visit") {
        summaryPatch.pageViews = FieldValue.increment(1);
        summaryPatch.lastPage = data.page || "";
      } else {
        summaryPatch.totalXp = FieldValue.increment(xp);
      }

      const batch = transaction;
      batch.set(summaryRef, summaryPatch, { merge: true });

      if (userRef) {
        const userPatch = {
          userId,
          lastSeenAt: FieldValue.serverTimestamp(),
          actionCounts: { [eventType]: FieldValue.increment(1) },
        };

        if (eventType === "site_visit") {
          userPatch.pageViews = FieldValue.increment(1);
        } else {
          userPatch.xp = FieldValue.increment(xp);
          userPatch.totalXp = FieldValue.increment(xp);
        }

        Object.entries(details).forEach(([key, value]) => {
          if (
            [
              "tutorMessagesSent",
              "focusMinutes",
              "durationSeconds",
              "cardsReviewed",
              "quizzesCompleted",
            ].includes(key) &&
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= 0 &&
            value <= 28800
          ) {
            userPatch[key] = FieldValue.increment(value);
          }
        });

        batch.set(userRef, userPatch, { merge: true });
      }

      batch.set(
        eventRef,
        {
          processedAt: FieldValue.serverTimestamp(),
          status: "processed",
        },
        { merge: true },
      );
    });
  },
);

exports.createSubscriptionCheckout = onCall(async (request) => {
  if (!request.auth?.uid)
    throw new HttpsError("unauthenticated", "Sign in first.");
  const { billingCycle, provider } = request.data || {};
  if (
    !Object.hasOwn(PRICES, billingCycle) ||
    !["click", "payme", "card"].includes(provider)
  ) {
    throw new HttpsError("invalid-argument", "Invalid billing options.");
  }
  const endpoint = process.env.PAYMENT_CHECKOUT_URL;
  const secret = process.env.PAYMENT_CHECKOUT_SECRET;
  if (!endpoint || !secret)
    throw new HttpsError(
      "failed-precondition",
      "Online payments are not configured yet. Please contact support.",
    );
  if (new URL(endpoint).protocol !== "https:")
    throw new HttpsError(
      "failed-precondition",
      "Invalid payment configuration.",
    );
  const userRef = db.doc(`users/${request.auth.uid}`);
  const checkoutRef = userRef.collection("subscriptionCheckouts").doc();
  const checkout = {
    plan: "pro",
    billingCycle,
    provider,
    amount: PRICES[billingCycle],
    currency: "UZS",
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  };
  // Reserve a checkout slot before making a paid provider request.
  await db.runTransaction(async (transaction) => {
    const rateRef = userRef.collection("trusted").doc("checkoutRate");
    const [userSnap, rateSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(rateRef),
    ]);
    if (!userSnap.exists)
      throw new HttpsError("failed-precondition", "Create your profile first.");
    if (Date.now() - Number(rateSnap.data()?.lastRequest || 0) < 30000)
      throw new HttpsError(
        "resource-exhausted",
        "Please wait before trying another payment.",
      );
    transaction.set(rateRef, { lastRequest: Date.now() });
    transaction.create(checkoutRef, checkout);
  });
  try {
    const providerResponse = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        "Idempotency-Key": checkoutRef.id,
      },
      body: JSON.stringify({
        userId: request.auth.uid,
        checkoutId: checkoutRef.id,
        billingCycle,
        provider,
        amount: checkout.amount,
        currency: checkout.currency,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!providerResponse.ok)
      throw new Error("Payment provider rejected checkout.");
    const data = await providerResponse.json();
    const url = new URL(data.checkoutUrl);
    const allowedHosts = (process.env.PAYMENT_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !allowedHosts.includes(url.hostname)
    ) {
      throw new Error("Invalid payment redirect.");
    }
    await checkoutRef.set({ checkoutUrl: url.href }, { merge: true });
    return { checkoutId: checkoutRef.id, checkoutUrl: url.href };
  } catch (error) {
    await checkoutRef.set({ status: "failed" }, { merge: true });
    logger.warn("Checkout creation failed", {
      checkoutId: checkoutRef.id,
      error: error.message,
    });
    throw new HttpsError(
      "unavailable",
      "Payment could not be started. Please try again.",
    );
  }
});

exports.onSubscriptionCheckoutCreated = onDocumentCreated(
  {
    document: "users/{userId}/subscriptionCheckouts/{checkoutId}",
    database: FIRESTORE_DATABASE,
  },
  async (event) => {
    await event.data?.ref.set(
      {
        serverStatus: "received",
        verificationStatus: "waiting_for_payment_webhook",
        serverReceivedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);

exports.onSubscriptionRequestCreated = onDocumentCreated(
  {
    document: "users/{userId}/subscriptionRequests/{requestId}",
    database: FIRESTORE_DATABASE,
  },
  async (event) => {
    await event.data?.ref.set(
      {
        serverStatus: "received",
        serverReceivedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);

exports.paymentWebhook = onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }

  const suppliedSecret = Buffer.from(
    request.get("x-noviq-webhook-secret") || "",
  );
  const expectedSecret = Buffer.from(WEBHOOK_SECRET);
  if (
    !WEBHOOK_SECRET ||
    suppliedSecret.length !== expectedSecret.length ||
    !timingSafeEqual(suppliedSecret, expectedSecret)
  ) {
    response.status(401).send("Unauthorized");
    return;
  }

  const body = request.body || {};
  const userId = String(body.userId || "");
  const checkoutId = String(body.checkoutId || "");
  const action = String(body.action || "activate");

  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
    !["activate", "cancel_renewal"].includes(action)
  ) {
    response.status(400).json({ error: "Missing userId" });
    return;
  }

  const userRef = db.doc(`users/${userId}`);

  if (action === "cancel_renewal") {
    await userRef.set(
      {
        subscription: {
          cancelAtPeriodEnd: true,
          cancelRequestedAt: new Date().toISOString(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    response.json({ ok: true, action });
    return;
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(checkoutId)) {
    response.status(400).json({ error: "Missing checkoutId" });
    return;
  }

  const checkoutRef = userRef
    .collection("subscriptionCheckouts")
    .doc(checkoutId);
  try {
    await db.runTransaction(async (transaction) => {
      const [checkoutSnap, userSnap] = await Promise.all([
        transaction.get(checkoutRef),
        transaction.get(userRef),
      ]);
      const checkout = checkoutSnap.data();
      if (
        !userSnap.exists ||
        !checkoutSnap.exists ||
        !validCheckout(checkout) ||
        body.amount !== checkout.amount ||
        body.currency !== checkout.currency ||
        body.provider !== checkout.provider ||
        typeof body.transactionId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(body.transactionId)
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Payment does not match a valid checkout.",
        );
      }
      const paymentRef = db.doc(
        `verifiedPayments/${checkout.provider}-${body.transactionId}`,
      );
      const paymentSnap = await transaction.get(paymentRef);
      if (checkout.status === "verified") return;
      if (paymentSnap.exists)
        throw new HttpsError("already-exists", "Payment was already used.");
      const subscription = buildSubscription({
        billingCycle: checkout.billingCycle,
        provider: checkout.provider,
        checkoutId,
      });
      transaction.set(
        userRef,
        {
          subscription,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.set(
        checkoutRef,
        {
          status: "verified",
          verificationStatus: "verified",
          verifiedAt: FieldValue.serverTimestamp(),
          transactionId: body.transactionId,
        },
        { merge: true },
      );
      transaction.create(paymentRef, {
        userId,
        checkoutId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    logger.warn("Payment verification failed", { error: error.message });
    response
      .status(
        error.code === "invalid-argument"
          ? 400
          : error.code === "already-exists"
            ? 409
            : 500,
      )
      .json({ error: "Payment verification failed" });
    return;
  }
  response.json({ ok: true, action: "activate", userId, checkoutId });
});

exports.verifySubscriptionManually = onCall(async (request) => {
  await assertAdmin(request);

  const userId = String(request.data?.userId || "");
  const checkoutId = String(request.data?.checkoutId || "");
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(checkoutId)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "userId and checkoutId are required.",
    );
  }

  const userRef = db.doc(`users/${userId}`);
  const checkoutRef = userRef
    .collection("subscriptionCheckouts")
    .doc(checkoutId);
  await db.runTransaction(async (transaction) => {
    const [checkoutSnap, userSnap] = await Promise.all([
      transaction.get(checkoutRef),
      transaction.get(userRef),
    ]);
    if (!checkoutSnap.exists || !userSnap.exists)
      throw new HttpsError("not-found", "Checkout or user not found.");
    const checkout = checkoutSnap.data();
    if (!validCheckout(checkout))
      throw new HttpsError("invalid-argument", "Invalid checkout.");
    if (checkout.status === "verified") return;
    const subscription = buildSubscription({
      billingCycle: checkout.billingCycle,
      provider: checkout.provider,
      checkoutId,
    });
    transaction.set(
      userRef,
      { subscription, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    transaction.set(
      checkoutRef,
      {
        status: "verified",
        verificationStatus: "manual_admin_verification",
        verifiedAt: FieldValue.serverTimestamp(),
        verifiedBy: request.auth.uid,
      },
      { merge: true },
    );
  });

  return { ok: true, userId, checkoutId };
});

exports.grantAdminByEmail = onCall(async (request) => {
  await assertAdmin(request);

  const email = String(request.data?.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid email is required.");
  }

  const userRecord = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(userRecord.uid, {
    ...(userRecord.customClaims || {}),
    admin: true,
  });
  await db.doc(`users/${userRecord.uid}`).set(
    {
      isAdmin: true,
      adminGrantedAt: FieldValue.serverTimestamp(),
      adminGrantedBy: request.auth.uid,
    },
    { merge: true },
  );

  return { ok: true, uid: userRecord.uid, email };
});

exports.generateAiResponse = onCall(
  {
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }

    const contents = request.data?.contents;
    const config = request.data?.config || {};
    const retries = Math.floor(clamp(request.data?.retries, 0, 1));
    const feature = request.data?.feature || "tutor";
    if (
      !Object.hasOwn(AI_LIMITS, feature) ||
      !contents ||
      Buffer.byteLength(JSON.stringify({ contents, config })) > 8 * 1024 * 1024
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid or oversized AI request.",
      );
    }
    normalizeGeminiContents(contents);
    if (!GEMINI_API_KEY)
      throw new HttpsError("failed-precondition", "MISSING_GEMINI_API_KEY");
    const today = dayKey();
    const now = Date.now();
    const userRef = db.doc(`users/${request.auth.uid}`);
    const usageRef = userRef.collection("trusted").doc("aiUsage");
    await db.runTransaction(async (transaction) => {
      const [userSnap, usageSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(usageRef),
      ]);
      if (!userSnap.exists)
        throw new HttpsError(
          "failed-precondition",
          "Create your profile first.",
        );
      const usage = usageSnap.data() || {};
      const pro = hasPro(userSnap.data().subscription, now);
      const counts = usage.dayKey === today ? usage.counts || {} : {};
      const total = usage.dayKey === today ? Number(usage.total) || 0 : 0;
      const minute = Math.floor(now / 60000);
      const minuteCount =
        usage.minute === minute ? Number(usage.minuteCount) || 0 : 0;
      if (minuteCount >= 10)
        throw new HttpsError("resource-exhausted", "AI_RATE_LIMIT");
      if (
        total >= (pro ? 300 : 14) ||
        (!pro && (Number(counts[feature]) || 0) >= AI_LIMITS[feature])
      ) {
        throw new HttpsError("resource-exhausted", "AI_DAILY_LIMIT");
      }
      transaction.set(usageRef, {
        dayKey: today,
        total: total + 1,
        counts: { ...counts, [feature]: (Number(counts[feature]) || 0) + 1 },
        minute,
        minuteCount: minuteCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const usageField = {
        tutor: "aiTutor",
        flashcards: "aiFlashcards",
        planner: "aiQuiz",
      }[feature];
      if (usageField)
        transaction.set(
          userRef,
          {
            usage: {
              [usageField]: { [today]: (Number(counts[feature]) || 0) + 1 },
            },
          },
          { merge: true },
        );
    });
    let lastError;
    const startedAt = Date.now();

    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (Date.now() - startedAt > 85000) break;
        try {
          const text = await callGeminiRest({ model, contents, config });
          return { text, model };
        } catch (error) {
          lastError = error;
          logger.warn("Gemini request failed", {
            uid: request.auth.uid,
            model,
            attempt,
            error: getAiFailureDetails(error).reason,
          });
          if (["AI_KEY_OR_PERMISSION", "AI_QUOTA_OR_RATE_LIMIT", "AI_REQUEST_REJECTED", "AI_UNSUPPORTED_FILE"].includes(getAiFailureDetails(error).reason)) throwAiFailure(error);
        }
      }
    }

    throwAiFailure(lastError);
  },
);

exports.sendTelegramTestMessage = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const userRef = db.doc(`users/${request.auth.uid}`);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const chatId = String(user.telegramId || "").trim();

  if (!isValidTelegramChatId(chatId)) {
    throw new HttpsError(
      "invalid-argument",
      "A numeric Telegram chat ID is required.",
    );
  }

  try {
    await sendTelegramMessage(
      chatId,
      isNotificationPreferenceEnabled(user, "dailyStreakSummary")
        ? "Noviq Telegram ulandi. Endi daily mission summary shu chatga keladi."
        : "Noviq Telegram ulandi. Daily mission summary hozir Preferences ichida o'chirilgan.",
    );
  } catch (error) {
    logger.warn("Telegram test message failed", {
      userId: request.auth.uid,
      chatId,
      error,
    });
    throw new HttpsError(
      "failed-precondition",
      error.message || "Telegram message failed.",
    );
  }

  await userRef.set(
    {
      telegramId: chatId,
      telegramLinkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true, chatId };
});

exports.createTelegramLink = onCall(async (request) => {
  if (!request.auth?.uid)
    throw new HttpsError("unauthenticated", "Sign in first.");
  if (!TELEGRAM_WEBHOOK_SECRET || !TELEGRAM_BOT_TOKEN)
    throw new HttpsError("failed-precondition", "Telegram is not configured.");
  const botResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`, {
    signal: AbortSignal.timeout(10000),
  });
  const bot = await botResponse.json();
  if (!botResponse.ok || !bot.ok || bot.result?.username?.toLowerCase() !== "noviqq_bot")
    throw new HttpsError("failed-precondition", "Configure the token for @noviqq_bot.");
  const token = randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  // One active token per account; issuing a new link invalidates the previous one.
  await db.doc(`users/${request.auth.uid}/trusted/telegramLink`).set({
    hash,
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60000),
    used: false,
  });
  await db.doc(`telegramLinks/${hash}`).set({
    userId: request.auth.uid,
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60000),
  });
  return { token };
});

exports.telegramWebhook = onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }

  if (
    !TELEGRAM_WEBHOOK_SECRET ||
    request.get("x-telegram-bot-api-secret-token") !== TELEGRAM_WEBHOOK_SECRET
  ) {
    response.status(401).send("Unauthorized");
    return;
  }

  const message = request.body?.message || request.body?.edited_message || {};
  const chatId = message.chat?.id;
  const text = String(message.text || "").trim();

  if (!chatId) {
    response.json({ ok: true, ignored: true });
    return;
  }

  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  const payload = String(startMatch?.[1] || "")
    .trim()
    .replace(/^link_/, "");

  if (/^[a-f0-9]{48}$/.test(payload) && message.chat?.type === "private") {
    const hash = createHash("sha256").update(payload).digest("hex");
    const linkedUser = await db.runTransaction(async (transaction) => {
      const lookupRef = db.doc(`telegramLinks/${hash}`);
      const lookup = await transaction.get(lookupRef);
      if (
        !lookup.exists ||
        toDate(lookup.data().expiresAt)?.getTime() <= Date.now()
      )
        return null;
      const userRef = db.doc(`users/${lookup.data().userId}`);
      const tokenRef = userRef.collection("trusted").doc("telegramLink");
      const [userSnap, tokenSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(tokenRef),
      ]);
      const token = tokenSnap.data();
      if (
        !userSnap.exists ||
        !token ||
        token.used ||
        token.hash !== hash ||
        !toDate(token.expiresAt) ||
        toDate(token.expiresAt).getTime() <= Date.now()
      )
        return null;
      transaction.set(
        userRef,
        {
          telegramId: String(chatId),
          telegramUsername: message.from?.username || "",
          telegramLinkedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.update(tokenRef, { used: true });
      transaction.delete(lookupRef);
      return userSnap.data();
    });
    if (linkedUser) {
      await sendTelegramMessage(
        chatId,
        isNotificationPreferenceEnabled(linkedUser, "dailyStreakSummary")
          ? "Noviq profilingiz Telegramga ulandi. Daily mission summary shu yerga keladi."
          : "Noviq profilingiz Telegramga ulandi. Daily mission summary hozir Preferences ichida o'chirilgan.",
      ).catch((error) =>
        logger.warn("Telegram webhook welcome failed", { chatId, error }),
      );
      response.json({ ok: true, linked: true });
      return;
    }
  }

  if (message.chat?.type !== "private") {
    response.json({ ok: true, ignored: true });
    return;
  }
  const command = text.split(/\s/)[0].split("@")[0].toLowerCase();
  if (["/planner", "/metrics"].includes(command)) {
    const accounts = await db.collection("users")
      .where("telegramId", "==", String(chatId)).limit(1).get();
    if (!accounts.empty && accounts.docs.length) {
      const account = accounts.docs[0];
      const user = account.data();
      const summary = command === "/planner"
        ? await buildTelegramDailySummary(account.id, user)
        : `NOVIQ Metrics\nXP: ${Math.max(0, Number(user.xp) || 0)}\nStreak: ${Math.max(0, Number(user.streak) || 0)} kun\nKunlik maqsad: ${Math.max(0, Number(user.dailyTargetMinutes) || 0)} min`;
      await sendTelegramMessage(chatId, summary);
      response.json({ ok: true, linked: true });
      return;
    }
  }
  await sendTelegramMessage(
    chatId,
    "Planner: /planner. Metrics: /metrics. Profilni ulash uchun Noviq profilingizdagi Connect bot tugmasini bosing. Havola 10 daqiqa amal qiladi va bir marta ishlatiladi.",
  ).catch((error) =>
    logger.warn("Telegram webhook help failed", { chatId, error }),
  );
  response.json({ ok: true, linked: false });
});

exports.sendDailyTelegramStudySummary = onSchedule(
  {
    schedule: "every day 21:00",
    timeZone: TELEGRAM_TIME_ZONE,
  },
  async () => {
    if (!TELEGRAM_BOT_TOKEN) {
      logger.warn(
        "Skipping Telegram daily summaries: TELEGRAM_BOT_TOKEN is not configured.",
      );
      return;
    }

    const todayKey = getTelegramDayKey();
    const usersSnapshot = await db
      .collection("users")
      .where("telegramId", "!=", "")
      .get();
    logger.info("Sending Telegram daily summaries", {
      todayKey,
      users: usersSnapshot.size,
    });

    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data() || {};
      const chatId = String(user.telegramId || "").trim();
      if (!isValidTelegramChatId(chatId)) continue;
      if (!isNotificationPreferenceEnabled(user, "dailyStreakSummary"))
        continue;

      const logRef = userDoc.ref
        .collection("telegramNotifications")
        .doc(`daily-${todayKey}`);
      const logSnap = await logRef.get();
      if (logSnap.exists && logSnap.data()?.status === "sent") continue;

      try {
        const text = await buildTelegramDailySummary(userDoc.id, user);
        await sendTelegramMessage(chatId, text);
        await logRef.set(
          {
            status: "sent",
            dayKey: todayKey,
            sentAt: FieldValue.serverTimestamp(),
            chatId,
          },
          { merge: true },
        );
      } catch (error) {
        logger.warn("Telegram daily summary failed", {
          userId: userDoc.id,
          chatId,
          error,
        });
        await logRef.set(
          {
            status: "failed",
            dayKey: todayKey,
            error: String(error.message || error).slice(0, 500),
            attemptedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }
  },
);
Object.assign(
  exports,
  require("./community")({ db, onCall, HttpsError, FieldValue }),
);
