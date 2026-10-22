import React from "react";
import { cn } from "@/src/lib/utils";
import { getTutorIntro } from "./tutorCopy";
import type { TutorAttachment } from "./tutorAttachments";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  attachments?: (Pick<TutorAttachment, "id" | "name" | "mimeType" | "size" | "previewUrl"> & {
    text?: string;
    contentStored?: boolean;
  })[];
}

export const ASSISTANT_AVATAR =
  "/saidamin-avatar.jpg";

export const INTRO_MESSAGE: Message = {
  id: "intro",
  role: "assistant",
  content: getTutorIntro("en-US"),
};

export const Avatar = ({ src, alt, size = "sm" }: { src: string; alt: string; size?: "sm" | "lg" }) => {
  const outerSize = size === "lg" ? "h-10 w-10 sm:h-14 sm:w-14" : "h-10 w-10";
  const dotSize = size === "lg" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full bg-gradient-to-tr from-fuchsia-500 via-amber-300 to-cyan-300 p-[2px] shadow-lg shadow-cyan-500/10",
        outerSize
      )}
    >
      <div className="h-full w-full rounded-full bg-slate-950 p-[2px]">
        <img src={src} alt={alt} className="h-full w-full rounded-full object-cover object-top" />
      </div>
      <span
        className={cn(
          "absolute bottom-0 right-0 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]",
          dotSize
        )}
      />
    </div>
  );
};

