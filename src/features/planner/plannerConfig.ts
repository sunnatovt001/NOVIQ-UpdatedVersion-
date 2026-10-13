import type { ExamMode } from "./plannerTypes";

export type ExamOption = {
  label: string;
  min: number;
  max: number;
  step: number;
  defaultGoal: string;
  current: string;
  target: string;
  sections: Array<{ name: string; current: string; target?: string }>;
};

export const EXAM_OPTIONS: Record<ExamMode, ExamOption> = {
  ielts: {
    label: "IELTS",
    min: 0,
    max: 9,
    step: 0.5,
    defaultGoal: "IELTS 7.5",
    current: "5.5",
    target: "7.5",
    sections: [
      { name: "Listening", current: "5.0" },
      { name: "Reading", current: "6.5" },
      { name: "Writing Task 1", current: "5.5" },
      { name: "Writing Task 2", current: "5.5" },
      { name: "Speaking", current: "5.0" },
      { name: "Vocabulary", current: "5.5" },
      { name: "Grammar", current: "5.0" },
    ],
  },
  sat: {
    label: "SAT",
    min: 400,
    max: 1600,
    step: 10,
    defaultGoal: "SAT 1350",
    current: "1050",
    target: "1350",
    sections: [
      { name: "Algebra", current: "520", target: "680" },
      { name: "Functions", current: "510", target: "670" },
      { name: "Geometry", current: "500", target: "660" },
      { name: "Data Analysis", current: "515", target: "670" },
      { name: "Reading Comprehension", current: "530", target: "670" },
      { name: "Vocabulary in Context", current: "520", target: "660" },
      { name: "Grammar", current: "525", target: "665" },
      { name: "Editing", current: "515", target: "660" },
    ],
  },
  hsk: {
    label: "HSK",
    min: 0,
    max: 300,
    step: 1,
    defaultGoal: "HSK 4 score 240",
    current: "165",
    target: "240",
    sections: [
      { name: "Vocabulary", current: "160" },
      { name: "Character Recognition", current: "150" },
      { name: "Reading", current: "170" },
      { name: "Listening", current: "155" },
      { name: "Grammar", current: "165" },
      { name: "Writing Characters", current: "140" },
      { name: "Speaking Practice", current: "150" },
    ],
  },
  cefr: {
    label: "CEFR",
    min: 0,
    max: 100,
    step: 1,
    defaultGoal: "CEFR B2 readiness 80%",
    current: "55",
    target: "80",
    sections: [
      { name: "Reading", current: "58" },
      { name: "Listening", current: "52" },
      { name: "Speaking", current: "50" },
      { name: "Writing", current: "54" },
      { name: "Vocabulary", current: "56" },
      { name: "Grammar", current: "53" },
    ],
  },
  school: {
    label: "School Subjects",
    min: 0,
    max: 100,
    step: 1,
    defaultGoal: "Math final exam 90%",
    current: "62",
    target: "90",
    sections: [
      { name: "Theory", current: "65" },
      { name: "Problem solving", current: "55" },
      { name: "Past papers", current: "50" },
      { name: "Weak topics", current: "45" },
    ],
  },
  entrance: {
    label: "University Entrance",
    min: 0,
    max: 100,
    step: 1,
    defaultGoal: "University entrance exam 85%",
    current: "58",
    target: "85",
    sections: [
      { name: "Subject Review", current: "62" },
      { name: "Problem Solving", current: "55" },
      { name: "Reading Analysis", current: "58" },
      { name: "Timed Mock", current: "52" },
      { name: "Past Papers", current: "50" },
      { name: "Weak Topic Recovery", current: "45" },
    ],
  },
};

export const DEFAULT_EXAM_DATE = new Date(new Date().getFullYear(), 11, 15)
  .toISOString()
  .slice(0, 10);

export const PLANNER_INPUT_CLASS =
  "w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-semibold text-[#0F172A] outline-none transition focus:border-[var(--noviq-accent)] focus:ring-4 focus:ring-[var(--noviq-soft)]";
