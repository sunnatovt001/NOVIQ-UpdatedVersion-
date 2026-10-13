export const validateActivityResponse = (kind: string, value: unknown): void => {
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const parsed = value as Record<string, any> | null;
  let valid = Boolean(parsed && typeof parsed === "object" && text(parsed.title) && text(parsed.instructions));
  if (valid && kind === "quiz") valid = Array.isArray(parsed!.questions) && parsed!.questions.length > 0 && parsed!.questions.every((q: any) =>
    q && text(q.prompt) && Array.isArray(q.options) && q.options.length >= 3 && q.options.every(text) &&
    new Set(q.options.map((option: string) => option.trim().toLocaleLowerCase())).size === q.options.length &&
    Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length);
  if (valid && kind === "flashcards") valid = Array.isArray(parsed!.flashcards) && parsed!.flashcards.length > 0 && parsed!.flashcards.every((card: any) => card && text(card.front) && text(card.back));
  if (valid && kind === "speaking") valid = text(parsed!.speakingPrompt);
  if (valid && kind === "writing") valid = text(parsed!.writingPrompt);
  if (!valid) throw new Error("AI returned an incomplete activity. Please retry.");
};
