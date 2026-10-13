import { askNotebook, type AiAttachment } from "@/src/lib/gemini";
import type { TutorLanguage } from "@/src/features/tutor/tutorCopy";

export const summarizeUploadedSource = (file: File, attachment: AiAttachment, extractedText: string, studentContext: string, language: TutorLanguage) =>
  askNotebook(
    "Create a Noviq Notebook mastery digest for this uploaded source. Include executive summary, key concepts, exam-relevant concepts, important definitions, common mistakes, exam traps, recall questions, application questions, exam-style questions, application-based flashcards, knowledge graph, learning roadmap, weakness opportunities, and revision suggestions.",
    [
      studentContext,
      `Uploaded source: ${file.name}. This uploaded file has highest source priority for this digest.`,
      extractedText
        ? `The uploaded source text is included below.\n\n${extractedText.slice(0, 18000)}`
        : "The uploaded source is attached as inline data. Read the file and produce a source-grounded mastery digest.",
    ].filter(Boolean).join("\n\n"),
    language,
    { attachments: [attachment], retries: 2 },
  );
