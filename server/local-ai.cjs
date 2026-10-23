// Development-only backend. Never bundled into browser or used by production.
const loopback = (address) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
const safeError = (status) => status === 401 || status === 403 ? "AI_KEY_OR_PERMISSION" : status === 429 ? "AI_QUOTA_OR_RATE_LIMIT" : status === 404 ? "AI_MODEL_UNAVAILABLE" : status === 400 ? "AI_REQUEST_REJECTED" : "AI_PROVIDER_UNAVAILABLE";
const TUTOR_MODEL = "gemini-3.5-flash-lite";
module.exports = function localAi({ apiKey: configuredApiKey, getApiKey, firebaseApiKey, fetchImpl = fetch, logger = console, models = ["gemini-3.5-flash", "gemini-3.1-flash-lite"] }) {
  const usage = new Map();
  return async (req, res, next) => {
    if (req.url !== "/__local-ai") return next();
    const send = (status, body) => { if(status>=400)logger.warn("Local AI request failed",{status,code:body.error}); res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
    let origin;
    try { origin = new URL(req.headers.origin); } catch { return send(403, { error: "LOCAL_ORIGIN_REQUIRED" }); }
    if (!loopback(req.socket.remoteAddress) || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || origin.host !== req.headers.host || req.method !== "POST" || !String(req.headers["content-type"] || "").startsWith("application/json")) return send(403, { error: "LOCAL_ORIGIN_REQUIRED" });
    // Read rotated development credentials for each request instead of retaining
    // the key that happened to exist when Vite started.
    const apiKey = getApiKey ? getApiKey() : configuredApiKey;
    if (!apiKey) return send(503, { error: "MISSING_GEMINI_API_KEY" });
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || "")?.[1];
    if (!token) return send(401, { error: "unauthenticated" });
    try {
      const verification = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(10000),
      });
      const account = await verification.json();
      const uid = account.users?.[0]?.localId;
      if (!verification.ok || !uid || account.users[0].disabled) return send(401, { error: "unauthenticated" });
      const now = Date.now(), history = (usage.get(uid) || []).filter((time) => time > now - 60000);
      if (history.length >= 10) return send(429, { error: "AI_RATE_LIMIT" });
      history.push(now); usage.set(uid, history);
      for (const [id, times] of usage) if (times.at(-1) < now - 60000) usage.delete(id);
      let raw = "", size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) return send(413, { error: "AI_REQUEST_REJECTED" }); raw += chunk.toString(); }
      let input;
      try { input = JSON.parse(raw); } catch { return send(400, { error: "AI_REQUEST_REJECTED" }); }
      const contents = typeof input.contents === "string" && input.contents.trim() ? [{ role: "user", parts: [{ text: input.contents }] }] : input.contents;
      if (!Array.isArray(contents) || !contents.length || contents.some((item) => !Array.isArray(item?.parts) || !item.parts.length)) return send(400, { error: "AI_REQUEST_REJECTED" });
      const config = input.config || {};
      const tutor = !input.feature || input.feature === "tutor";
      const body = { contents, generationConfig: { maxOutputTokens: tutor ? 4096 : 8192, ...(tutor ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}), ...(config.responseMimeType ? { responseMimeType: config.responseMimeType } : {}), ...(config.responseSchema ? { responseSchema: config.responseSchema } : {}) }, ...(typeof config.systemInstruction === "string" ? { systemInstruction: { parts: [{ text: config.systemInstruction }] } } : {}) };
      if (Array.isArray(config.tools) && config.tools.some(tool => tool && Object.hasOwn(tool, "urlContext"))) body.tools = [{ urlContext: {} }];
      let response, selectedModel;
      const signal = AbortSignal.timeout(30000);
      // Tutor always uses one fast model. Retry only an explicit transient HTTP
      // rejection, never a timed-out generation, credentials or exhausted quota.
      const candidates = tutor ? [TUTOR_MODEL, TUTOR_MODEL] : [...new Set(models)].slice(0, 2);
      const startedAt = Date.now();
      for (const model of candidates) {
        if (!/^[a-zA-Z0-9._-]+$/.test(model)) continue;
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal });
        if (response.ok) { selectedModel = model; break; }
        logger.warn("Local Gemini model failed", { model, status: response.status });
        const retryable = tutor ? [500, 502, 503, 504] : [404, 500, 502, 503, 504];
        if (!retryable.includes(response.status)) {
          const failure = await response.json().catch(() => ({}));
          const invalidKey = /API[_ ]KEY[_ ]INVALID|API key not valid/i.test(JSON.stringify(failure.error || {}));
          return send(response.status, { error: invalidKey ? "AI_KEY_OR_PERMISSION" : safeError(response.status) });
        }
        await response.body?.cancel();
      }
      if (!response || !response.ok) return send(response?.status || 503, { error: safeError(response?.status || 503) });
      const payload = await response.json();
      const text = (payload.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought).map((part) => part.text || "").join("").trim();
      if (!text) return send(502, { error: "AI_EMPTY_RESPONSE" });
      logger.info?.("Local AI generation completed", { model: selectedModel, elapsedMs: Date.now() - startedAt });
      return send(200, { text, model: selectedModel });
    } catch (error) { return send(503, { error: /timeout|abort/i.test(String(error?.name)) ? "AI_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE" }); }
  };
};
