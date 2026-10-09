import { CloudUpload } from "lucide-react";
import { useLocale } from "@/src/contexts/LocaleContext";

export function TutorSaveStatus({ message, retry }: { message: string; retry: () => Promise<void> }) {
  const { t } = useLocale();
  if (!message) return null;
  const pending = /cloud sync|cloud save failed|could not sync/.test(message);
  return <div role={pending ? "status" : "alert"} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
    <CloudUpload size={14} className="shrink-0" aria-hidden="true" />
    <span>{pending ? t("tutor.savedPending") : message}</span>
    <button type="button" onClick={() => void retry()} className="min-h-8 font-semibold underline underline-offset-2">{t("tutor.retrySaving")}</button>
  </div>;
}
