import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/src/lib/firebase";
import { isReadOnlyAudit, isLocalAi } from "./auditMode";

export interface TutorHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface AiAttachment {
  name: string;
  mimeType: string;
  data?: string;
  text?: string;
}

interface AskTutorOptions {
  feature?: "tutor" | "planner";
  history?: TutorHistoryItem[];
  attachments?: AiAttachment[];
  retries?: number;
}

interface AskNotebookOptions extends AskTutorOptions {}

const Type = {
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STRING: "STRING",
  NUMBER: "NUMBER",
} as const;

const generateAiResponse = httpsCallable<
  { contents: unknown; config?: unknown; retries?: number; feature: string },
  { text?: string }
>(functions, "generateAiResponse", { timeout: 130000 });

const getCallableErrorInfo = (error: unknown) => {
  const record = typeof error === "object" && error ? (error as Record<string, unknown>) : {};
  const details = typeof record.details === "object" && record.details ? (record.details as Record<string, unknown>) : {};
  const message =
    String(details.message || "") ||
    (error instanceof Error ? error.message : "") ||
    String(record.message || "") ||
    String(error || "");

  return {
    code: String(record.code || ""),
    message,
    reason: String(details.reason || ""),
  };
};

export const models = {
  flash: "gemini-3.8-flash",
};

export const getFriendlyAiError = (error: unknown) => {
  const { code, message, reason } = getCallableErrorInfo(error);
  const searchable = `${reason} ${code} ${message}`;

  if (/read-only audit/i.test(searchable)) return "AI requests are disabled in read-only audit mode.";

  if (/unauthenticated|sign in/i.test(searchable)) return "Your session expired. Sign in again to use AI.";
  if (/deadline-exceeded|timeout|timed out|aborted/i.test(searchable)) return "The AI request timed out. Please retry.";
  if (/EMPTY_AI_RESPONSE|AI_EMPTY_RESPONSE/i.test(searchable)) return "AI returned an empty response. Please retry.";

  if (/AI_DAILY_LIMIT/i.test(searchable)) return "Your daily AI allowance is used. Try again tomorrow or upgrade your plan.";
  if (/AI_RATE_LIMIT/i.test(searchable)) return "Too many AI requests. Please wait a minute and try again.";

  if (/MISSING_GEMINI_API_KEY/i.test(searchable)) {
    return "AI server key is missing. Add GEMINI_API_KEY to Firebase Functions environment and redeploy.";
  }

  if (/functions\/not-found|function.*not found|cloud function.*not found|not-found/i.test(searchable)) {
    return "AI backend is not deployed. Upgrade the Firebase project to Blaze, then deploy Firebase Functions.";
  }

  if (/AI_QUOTA_OR_RATE_LIMIT|quota|rate|429|resource_exhausted/i.test(searchable)) {
    return "AI service is busy or rate limited. Please try again in a moment.";
  }

  if (/AI_KEY_OR_PERMISSION|api key|permission|403|401/i.test(searchable)) {
    return "AI server key is invalid or does not have Gemini API access. Check Firebase Functions GEMINI_API_KEY and redeploy.";
  }

  if (/AI_MODEL_UNAVAILABLE|model|not found|404/i.test(searchable)) {
    return "The configured AI model is unavailable. Noviq tried fallback models, but the request still failed.";
  }

  if (/AI_UNSUPPORTED_FILE|mime|unsupported|file type/i.test(searchable)) {
    return "This file type is not supported by the AI service. Upload PDF, DOCX, TXT, image, or paste the text.";
  }

  if (/AI_REQUEST_REJECTED|invalid|400|bad request|invalid-argument/i.test(searchable)) {
    return "The AI request was rejected. Try a shorter message or remove unsupported attachments.";
  }

  if (/network|fetch|failed to fetch/i.test(searchable)) {
    return "Network connection to the AI service failed. Check your internet connection and try again.";
  }

  return "AI service failed to answer. Please retry.";
};

const buildHistoryContext = (history: TutorHistoryItem[] = []) => {
  if (!history.length) return "";

  return history
    .slice(-12)
    .map((item) => `${item.role === "user" ? "Student" : "Tutor"}: ${item.content}`)
    .join("\n\n");
};

const buildAttachmentParts = (attachments: AiAttachment[] = []) =>
  attachments.flatMap((attachment) => {
    const label = `Attachment: ${attachment.name} (${attachment.mimeType || "unknown type"})`;

    if (attachment.text) {
      return [{ text: `${label}\n\n${attachment.text}` }];
    }

    if (attachment.data && attachment.mimeType) {
      return [
        { text: label },
        {
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        },
      ];
    }

    return [{ text: label }];
  });

const generateWithFallback = async ({
  contents,
  config,
  retries = 1,
  feature = "tutor",
}: {
  contents: any;
  config?: any;
  retries?: number;
  feature?: "tutor" | "notebook" | "planner" | "flashcards";
}) => {
  try {
    const localAi = isLocalAi;
    if (isReadOnlyAudit && !localAi) throw new Error("AI requests are disabled in read-only audit mode. Use isolated tests for send flows.");
    let response;
    if (localAi) {
      if (!auth.currentUser) throw new Error("unauthenticated");
      const result = await fetch("/__local-ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify({ contents, config, feature }), signal: AbortSignal.timeout(45000) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "AI_PROVIDER_UNAVAILABLE");
      response = { data };
    } else response = await generateAiResponse({ contents, config, retries, feature });
    const text = response.data?.text?.trim();
    if (!text) throw new Error("EMPTY_AI_RESPONSE");
    return text;
  } catch (error) {
    throw new Error(getFriendlyAiError(error));
  }
};

export async function generateStudyPlan(goals: any) {
  const prompt = `Create a detailed daily exam-preparation roadmap for the following goals:
${JSON.stringify(goals)}

Noviq is an AI Study Operating System for exam preparation and academic success.
Stay focused on IELTS, SAT, HSK, CEFR, school subjects, or university entrance exams.
Do not create programming, general science, or generic language-learning tracks unless the goal explicitly names a school subject or entrance exam requirement.

Return the response in JSON format.`;

  const text = await generateWithFallback({
    feature: "planner",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          roadmap: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.NUMBER },
                title: { type: Type.STRING },
                tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["day", "title", "tasks"],
            },
          },
        },
        required: ["roadmap"],
      },
    },
  });

  return JSON.parse(text);
}

export async function askTutor(
  question: string,
  context?: string,
  language?: string,
  options: AskTutorOptions = {}
) {
  const languageName = language === "en-US" ? "English" : language === "ru-RU" ? "Russian" : "Uzbek";
  const historyContext = buildHistoryContext(options.history);
  const systemInstruction = `You are Noviq Tutor.
You are not ChatGPT. You are not a generic AI assistant.

Mission:
Your only goal is to improve the student's exam performance and probability of reaching the target score. Do not merely answer questions. Every response must connect to exam progress.

Student context:
Before answering, use any available context: exam type, current level, target score, days remaining, weak areas, current study plan, uploaded materials, recent mistakes, and previous conversations.
If context is missing, do not invent it. Make one useful assumption, say what is missing briefly, and ask for the missing detail only if it blocks a good answer.

Personalization rule:
Never give generic advice like "practice more." Tie advice to the student's goal, level, remaining time, weak area, or current mission whenever context exists.

Teaching style:
Act like a world-class private exam mentor. Use simple explanations for beginners, structured explanations for intermediate students, and exam-focused explanations for advanced students. Never sound robotic, academic, corporate, or like Wikipedia.

Socratic method:
Whenever possible, guide first with a question or hint before fully solving. If the student asks for checking, translation, urgent feedback, or an answer-only response, give the direct answer first, then teach the gap.

Exam-first rule:
Explain why the concept matters for IELTS, SAT, HSK, CEFR, school subjects, or university entrance exams. Do not position Noviq as a programming, generic science, or generic language-learning product.

Material-first rule:
If uploaded materials or notebook sources are provided, use them first. Reference the material names and avoid random explanations that ignore the student's content.

Knowledge gaps:
When you detect misunderstanding, identify the gap, explain it simply, give a mini-example, give a practice question, and verify understanding.

Memory reinforcement:
After important explanations, include one recall question, one application question, and one exam-style question.

Language:
Answer fluently in ${languageName}. If the student uses Uzbek, answer naturally in Uzbek Latin unless the selected language says otherwise.

Default response format:
Use these sections unless the student explicitly asks for a very short answer:
1. Direct Answer
2. Why It Matters
3. Exam Connection
4. Quick Practice
5. Next Step

Always end with a concrete action for the student's next study move.`;

  const textPrompt = [
    context ? `Context:\n${context}` : "",
    historyContext ? `Recent conversation memory:\n${historyContext}` : "",
    `Student question:\n${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const attachmentParts = buildAttachmentParts(options.attachments);
  const contents = attachmentParts.length
    ? [{ role: "user", parts: [...attachmentParts, { text: textPrompt }] }]
    : textPrompt;

  return generateWithFallback({
    contents,
    feature: options.feature || "tutor",
    config: { systemInstruction },
    retries: options.retries ?? 1,
  });
}

export async function askNotebook(
  question: string,
  context?: string,
  language?: string,
  options: AskNotebookOptions = {}
) {
  const languageName = language === "uz-UZ" ? "Uzbek" : language === "ru-RU" ? "Russian" : "English";
  const historyContext = buildHistoryContext(options.history);
  const systemInstruction = `You are Noviq Notebook Intelligence Engine.
You are not ChatGPT, a generic AI assistant, a document chatbot, or a summarization tool.

Mission:
Transform uploaded knowledge into exam success. Your goal is to help the student understand, remember, apply, and score higher.

Student context:
Use the available exam type, current level, target score, days remaining, weak topics, uploaded sources, notes, previous interactions, and study progress. Never provide generic answers.

Source priority:
Use sources in this order when available:
1. Uploaded PDFs and files
2. User notes
3. Imported documents, websites, and YouTube transcripts
4. Study decks
5. Previous notebook knowledge
6. General knowledge
Never answer from general knowledge if the answer exists in the uploaded or notebook materials.

Mandatory reasoning process:
Before answering, determine whether the answer exists inside the sources, find the most relevant sources, extract supporting evidence, infer why the student is asking, connect the concept to exam performance, identify likely misconceptions, and generate learning opportunities.

Source grounding:
Every substantive answer must include SOURCE USED, KEY EVIDENCE, and RELATED MATERIALS. If no source supports the answer, say that clearly and separate any general exam guidance from source-grounded guidance. Never invent references.

When a document is uploaded:
Produce a mastery digest, not a plain summary. Include executive summary, key concepts, exam-relevant concepts, important definitions, common mistakes, exam traps, recall questions, application questions, exam-style questions, flashcards, knowledge graph, learning roadmap, weakness opportunities, and revision suggestions.

Understanding engine:
When explaining a concept, include what it means, why it matters, a simple explanation, a real example, an exam example, a common mistake, a memory trick, and a quick check question.

Exam-first thinking:
For important concepts, include exam relevance, likely frequency, difficulty, common traps, and likely question types. Generate only skill-testing questions, not trivia or exam-meta questions.

Memory science:
Use active recall, spaced repetition, interleaving, and retrieval practice. Do not recommend passive rereading as the main strategy.

Flashcard quality:
Generate cards that test application and thinking, not definition-only memorization.

Language:
Answer fluently in ${languageName}. If the user writes Uzbek, answer naturally in Uzbek Latin unless the selected language says otherwise.

Default output format:
SUMMARY
KEY INSIGHTS
SOURCE USED
KEY EVIDENCE
RELATED MATERIALS
WHY IT MATTERS
EXAM CONNECTION
COMMON TRAPS
RECALL QUESTION
APPLICATION QUESTION
EXAM QUESTION
NEXT BEST ACTION

Always end with a concrete next action that improves exam readiness.`;

  const textPrompt = [
    context ? `Notebook context:\n${context}` : "",
    historyContext ? `Previous notebook interactions:\n${historyContext}` : "",
    `Student request:\n${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const attachmentParts = buildAttachmentParts(options.attachments);
  const contents = attachmentParts.length
    ? [{ role: "user", parts: [...attachmentParts, { text: textPrompt }] }]
    : textPrompt;

  return generateWithFallback({
    contents,
    feature: "notebook",
    config: { systemInstruction },
    retries: options.retries ?? 1,
  });
}

export async function generateFlashcards(content: string, count = 12) {
  const prompt = `Generate ${count} useful exam-preparation flashcards from this content.
Each card must test one clear idea students may need for IELTS, SAT, HSK, CEFR, school subjects, or university entrance exams.
Prefer concise questions, complete answers, and academically useful wording.

Content:
${content}

Return the response in JSON format.`;

  const text = await generateWithFallback({
    feature: "flashcards",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING, description: "The question or concept" },
            back: { type: Type.STRING, description: "The answer or definition" },
          },
          required: ["front", "back"],
        },
      },
    },
  });

  return JSON.parse(text);
}
