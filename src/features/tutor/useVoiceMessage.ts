import { useEffect, useRef, useState } from "react";
import { fileToTutorAttachment, type TutorAttachment } from "./tutorAttachments";

export function useVoiceMessage(onFile: (file: TutorAttachment) => void, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  const release = () => {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
    };
  }, []);
  const toggle = async () => {
    if (recorder.current?.state === "recording") { recorder.current.stop(); return; }
    if (starting.current || busy) return;
    starting.current = true;
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microphone recording is unavailable. Use HTTPS or localhost, or upload an audio file.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = active;
      const chunks: Blob[] = [];
      let bytes = 0;
      active.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes >= 4 * 1024 * 1024 && active.state === "recording") active.stop();
      };
      active.onerror = () => { release(); if (mounted.current) { setRecording(false); setBusy(false); onError("Could not record audio. Check microphone permission and try again."); } };
      active.onstop = async () => {
        release();
        if (!mounted.current) return;
        setRecording(false); setBusy(true);
        try {
          const type = active.mimeType.split(";")[0] || "audio/webm";
          const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const blob = new Blob(chunks, { type });
          if (!blob.size) throw new Error("No audio was recorded. Please try again.");
          const file = await fileToTutorAttachment(new File([blob], `Voice-${Date.now()}.${extension}`, { type }));
          if (mounted.current) onFile(file);
        } catch (error) { if (mounted.current) onError(error instanceof Error ? error.message : "Audio processing failed."); }
        finally { if (mounted.current) setBusy(false); }
      };
      active.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => { if (active.state === "recording") active.stop(); }, 120000);
    } catch (error) {
      release();
      if (mounted.current) onError(error instanceof Error ? error.message : "Microphone access failed.");
    } finally { starting.current = false; if (mounted.current) setBusy(false); }
  };
  return { recording, busy, toggle };
}
