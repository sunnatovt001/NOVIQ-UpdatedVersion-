// Development-only backend. Never bundled into browser or used by production.
const loopback = (address) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
const safeError = (status) => status === 401 || status === 403 ? "AI_KEY_OR_PERMISSION" : status === 429 ? "AI_QUOTA_OR_RATE_LIMIT" : status === 404 ? "AI_MODEL_UNAVAILABLE" : status === 400 ? "AI_REQUEST_REJECTED" : "AI_PROVIDER_UNAVAILABLE";
module.exports = function localAi({ apiKey, firebaseApiKey, fetchImpl = fetch }) {
  const usage = new Map();
  return async (req, res, next) => {
    if (req.url !== "/__local-ai") return next();
    const send = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
    let origin;
    try { origin = new URL(req.headers.origin); } catch { return send(403, { error: "LOCAL_ORIGIN_REQUIRED" }); }
    if (!loopback(req.socket.remoteAddress) || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || origin.host !== req.headers.host || req.method !== "POST" || !String(req.headers["content-type"] || "").startsWith("application/json")) return send(403, { error: "LOCAL_ORIGIN_REQUIRED" });
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
      const body = { contents, generationConfig: { maxOutputTokens: 8192, ...(config.responseMimeType ? { responseMimeType: config.responseMimeType } : {}), ...(config.responseSchema ? { responseSchema: config.responseSchema } : {}) }, ...(typeof config.systemInstruction === "string" ? { systemInstruction: { parts: [{ text: config.systemInstruction }] } } : {}) };
      const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      if (!response.ok) return send(response.status, { error: safeError(response.status) });
      const payload = await response.json();
      const text = (payload.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought).map((part) => part.text || "").join("").trim();
      if (!text) return send(502, { error: "AI_EMPTY_RESPONSE" });
      return send(200, { text, model: "gemini-3.8-flash" });
    } catch (error) { return send(503, { error: /timeout|abort/i.test(String(error?.name)) ? "AI_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE" }); }
  };
};
