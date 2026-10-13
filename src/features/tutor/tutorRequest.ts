import type { TutorLanguage } from "./tutorCopy";

export const buildTutorRequestContext = (
  language: TutorLanguage,
  studentContext: string,
  materials: readonly { name: string }[],
) => {
  const instruction = language === "en-US"
    ? "Answer naturally in English."
    : language === "ru-RU"
      ? "Answer naturally in Russian."
      : "Answer naturally in Uzbek.";
  const materialInstruction = materials.length
    ? `Uploaded materials in this request: ${materials.map(material => material.name).join(", ")}. Use these materials first and reference them by name.`
    : "";
  return [instruction, studentContext, materialInstruction].filter(Boolean).join("\n\n");
};
