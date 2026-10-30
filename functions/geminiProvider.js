// Gemini transport and safe provider-error classification; shared by all plans.
module.exports = function createGeminiProvider({HttpsError,apiKey,fetchImpl=fetch}) {
const GEMINI_API_KEY=apiKey;
const normalizeGeminiContents = (contents) => {
  if (typeof contents === "string") {
    return [{ role: "user", parts: [{ text: contents }] }];
  }
  if (Array.isArray(contents)) return contents;
  throw new HttpsError("invalid-argument", "Invalid AI contents.");
};

const normalizeGeminiConfig = (config, tutor = false) => {
  if (!config || typeof config !== "object") return {};
  const { systemInstruction, responseMimeType, responseSchema } = config;
  const instruction = typeof systemInstruction === 'string' ? systemInstruction :
    Array.isArray(systemInstruction?.parts) ? systemInstruction.parts.map(part => typeof part?.text === 'string' ? part.text : '').join('\n') : undefined;
  return {
    systemInstruction:
      instruction,
    generationConfig: {
      maxOutputTokens: tutor ? 4096 : 8192,
      ...(tutor ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
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
    .filter((part) => !part.thought)
    .map((part) => part.text || "")
    .join("")
    .trim();
};

const callGeminiRest = async ({ model, contents, config, feature }) => {
  if (!GEMINI_API_KEY) {
    throw new HttpsError("failed-precondition", "MISSING_GEMINI_API_KEY");
  }

  const normalizedConfig = normalizeGeminiConfig(config, feature === "tutor");
  const body = {
    contents: normalizeGeminiContents(contents),
    ...(Array.isArray(config?.tools) && config.tools.some(tool => tool && Object.hasOwn(tool, "urlContext")) ? { tools: [{ urlContext: {} }] } : {}),
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

  const response = await fetchImpl(
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


return {callGeminiRest,throwAiFailure,getAiFailureDetails,normalizeGeminiContents};
};
