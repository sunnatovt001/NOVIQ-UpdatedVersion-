import { recordDate } from "./recordDate";

export const missionCompletion = (total: number, completed: number): number | null =>
  total > 0 ? Math.round(Math.min(total, Math.max(0, completed)) / total * 100) : null;

export const isMeaningfulSession = (session: { duration?: unknown; timestamp?: unknown; status?: unknown }) => {
  const duration = Number(session.duration);
  return Number.isFinite(duration) && duration >= 60 && Boolean(recordDate(session.timestamp)) &&
    !["inProgress", "in_progress", "pending", "cancelled"].includes(String(session.status));
};

export const summarizeCards = (cards: Record<string, unknown>[], now = Date.now()) => ({
  total: cards.length,
  due: cards.filter((card) => {
    const date = recordDate(card.dueAt);
    return date != null && date.getTime() <= now;
  }).length,
  reviewed: cards.filter((card) => Number(card.reviewCount) > 0).length,
});

export const reviewGuidance = (total: number, reviewed: number, due: number) => {
  if (!total) return "Create recall cards from your study material to start reviewing.";
  if (!reviewed) return "No card reviews recorded yet. Start with your due cards.";
  if (due > 0) return `${due} cards are due across your decks. Review them before adding new cards.`;
  return "No cards are due right now. Retention needs repeated recall results; coverage alone does not measure it.";
};

export const messageAuthor = (message: Record<string, unknown>) =>
  [message.displayName, message.authorName, message.userName, message.name]
    .find((value) => typeof value === "string" && value.trim()) as string || "Former or unnamed member";

export const resolveMessageAuthor = (message: Record<string, unknown>, resolved?: string | null, state?: string) => {
  const stored = messageAuthor(message);
  if (stored !== "Former or unnamed member") return stored;
  if (typeof resolved === "string" && resolved.trim()) return resolved.trim();
  if (resolved === null) return stored;
  if (state === "loading") return "Loading member name…";
  if (state === "error") return "Member name unavailable";
  return stored;
};
