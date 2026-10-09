import type { AiAttachment } from "@/src/lib/gemini";

export interface TutorAttachment extends AiAttachment {
  id: string;
  size: number;
  previewUrl?: string;
}

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const shouldReadText = (file: File) =>
  file.type.startsWith("text/") ||
  /\.(txt|md|csv|json|log|html|css|js|ts|tsx)$/i.test(file.name);

const isDocxFile = (file: File) =>
  file.type === DOCX_MIME_TYPE || /\.docx$/i.test(file.name);

const getSupportedInlineMimeType = (file: File) => {
  if (file.type.startsWith("image/")) return file.type;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return "application/pdf";
  }
  return "";
};

const isLegacyOfficeFile = (file: File) =>
  /\.(doc|ppt|pptx)$/i.test(file.name) && !isDocxFile(file);

const extractDocxText = async (file: File) => {
  const mammothModule = (await import("mammoth")) as unknown as {
    extractRawText?: (input: {
      arrayBuffer: ArrayBuffer;
    }) => Promise<{ value: string }>;
    default?: {
      extractRawText?: (input: {
        arrayBuffer: ArrayBuffer;
      }) => Promise<{ value: string }>;
    };
  };
  const mammoth = mammothModule.extractRawText
    ? mammothModule
    : mammothModule.default;
  if (!mammoth?.extractRawText) {
    throw new Error("DOCX reader is unavailable.");
  }

  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  const text = result.value.trim();
  if (!text) {
    throw new Error(
      `${file.name} has no readable text. Export it as PDF or paste the text.`,
    );
  }
  return text;
};

export const fileToTutorAttachment = async (
  file: File,
): Promise<TutorAttachment> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`,
    );
  }

  if (isLegacyOfficeFile(file)) {
    throw new Error(
      `${file.name} is not supported directly. Upload PDF, DOCX, TXT, image, or paste the text.`,
    );
  }

  if (isDocxFile(file)) {
    return {
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      mimeType: DOCX_MIME_TYPE,
      size: file.size,
      text: await extractDocxText(file),
    };
  }

  if (shouldReadText(file)) {
    return {
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      mimeType: file.type || "text/plain",
      size: file.size,
      text: await readAsText(file),
    };
  }

  const inlineMimeType = getSupportedInlineMimeType(file);
  if (!inlineMimeType) {
    throw new Error(
      `${file.name} is not supported by the AI service. Upload PDF, DOCX, TXT, image, or paste the text.`,
    );
  }

  const dataUrl = await readAsDataUrl(file);
  const [, data = ""] = dataUrl.split(",");

  return {
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    mimeType: inlineMimeType,
    size: file.size,
    data,
    previewUrl: file.type.startsWith("image/") ? dataUrl : undefined,
  };
};
