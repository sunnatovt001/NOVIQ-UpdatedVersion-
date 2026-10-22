import type { TutorLanguage } from "./tutorCopy";

export const buildTutorRequestContext = (
  language: TutorLanguage,
  studentContext: string,
  materials: readonly { name: string }[],
) => {
  // UI language is only a fallback; it must never override the student's question.
  const instruction = `Interface language: ${language}. Match the language of the latest student question, not the interface or uploaded materials.`;
  const materialInstruction = materials.length
    ? `Uploaded materials in this request: ${materials.map(material => material.name).join(", ")}. Use these materials first and reference them by name.`
    : "";
  return [instruction, studentContext, materialInstruction].filter(Boolean).join("\n\n");
};
