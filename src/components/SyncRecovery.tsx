import React, { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, ChevronDown } from "lucide-react";
import { useAuth } from "@/src/contexts/AuthContext";
import { exportPendingChanges, flushOfflineSyncQueue, getOfflineSyncQueue, importPendingChanges } from "@/src/lib/offlineSync";
import { withDeadline } from "@/src/lib/asyncRequest";
import { useLocale, type AppLocale } from "@/src/contexts/LocaleContext";

const SYNC_COPY = {
  en: { readError: "Local changes could not be read.", attention: "Local changes need attention", waiting: "{count} changes waiting for cloud sync", none: "No pending cloud changes", safety: "Before switching domain or device, sync your changes or export a backup. Backups contain private study data; keep them safe.", remaining: "Changes remain on this device. Check your connection and retry.", complete: "Cloud sync completed.", failed: "Cloud sync failed.", syncing: "Syncing…", retry: "Retry cloud sync", export: "Export pending changes", exportFailed: "Export failed.", import: "Import pending changes", backup: "Pending changes backup", tooLarge: "Backup is too large (maximum 10 MB).", imported: "{count} private changes imported. Existing pending edits were preserved. Retry cloud sync to upload.", importFailed: "Import failed.", region: "Cloud sync recovery" },
  uz: { readError: "Mahalliy o‘zgarishlarni o‘qib bo‘lmadi.", attention: "Mahalliy o‘zgarishlarni tekshirish kerak", waiting: "{count} ta o‘zgarish bulut sinxronizatsiyasini kutmoqda", none: "Bulutga yuborilmagan o‘zgarish yo‘q", safety: "Domen yoki qurilmani almashtirishdan oldin o‘zgarishlarni sinxronlang yoki zaxira nusxa oling. Zaxirada shaxsiy o‘quv ma’lumotlari bor; uni xavfsiz saqlang.", remaining: "O‘zgarishlar shu qurilmada qoldi. Internetni tekshirib, qayta urinib ko‘ring.", complete: "Bulut sinxronizatsiyasi tugadi.", failed: "Bulut sinxronizatsiyasi bajarilmadi.", syncing: "Sinxronlanmoqda…", retry: "Bulut sinxronizatsiyasini qayta urinish", export: "Kutilayotgan o‘zgarishlarni eksport qilish", exportFailed: "Eksport bajarilmadi.", import: "Kutilayotgan o‘zgarishlarni import qilish", backup: "O‘zgarishlar zaxira nusxasi", tooLarge: "Zaxira juda katta (eng ko‘pi 10 MB).", imported: "{count} ta shaxsiy o‘zgarish import qilindi. Mavjud tahrirlar saqlandi. Bulutga yuklash uchun sinxronizatsiyani qayta ishga tushiring.", importFailed: "Import bajarilmadi.", region: "Bulut sinxronizatsiyasini tiklash" },
  ru: { readError: "Не удалось прочитать локальные изменения.", attention: "Локальные изменения требуют внимания", waiting: "Изменений ожидают облачной синхронизации: {count}", none: "Нет ожидающих облачных изменений", safety: "Перед сменой домена или устройства синхронизируйте изменения либо экспортируйте резервную копию. Она содержит личные учебные данные — храните её безопасно.", remaining: "Изменения остались на устройстве. Проверьте соединение и повторите попытку.", complete: "Облачная синхронизация завершена.", failed: "Облачная синхронизация не выполнена.", syncing: "Синхронизация…", retry: "Повторить облачную синхронизацию", export: "Экспортировать ожидающие изменения", exportFailed: "Экспорт не выполнен.", import: "Импортировать ожидающие изменения", backup: "Резервная копия изменений", tooLarge: "Резервная копия слишком велика (максимум 10 МБ).", imported: "Импортировано личных изменений: {count}. Существующие правки сохранены. Повторите синхронизацию для загрузки.", importFailed: "Импорт не выполнен.", region: "Восстановление облачной синхронизации" },
} satisfies Record<AppLocale, Record<string, string>>;

const formatCopy = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);

export const SyncRecovery = ({ alwaysVisible = false }: {alwaysVisible?: boolean}) => {
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const copy = SYNC_COPY[locale];
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ownerRef = useRef(user?.uid); ownerRef.current = user?.uid;
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => {
    if (ownerRef.current !== user?.uid) return;
    try {
      setPending(getOfflineSyncQueue().filter(item => item.userId === user?.uid && item.status !== "synced").length);
      setError("");
    } catch (error) { setError(error instanceof Error ? error.message : copy.readError); }
  }, [copy.readError, user?.uid]);
  useEffect(() => {
    setStatus("");setBusy(false);setExpanded(false);
    refresh();
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("noviq:offline-sync", refresh);
    const storage = (event: StorageEvent) => { if (event.key === "noviq:offlineSyncQueue:v1") refresh(); };
    window.addEventListener("storage", storage);
    return () => { window.clearInterval(timer); window.removeEventListener("noviq:offline-sync", refresh); window.removeEventListener("storage", storage); };
  }, [refresh]);
  if (!user || (!alwaysVisible && !pending && !error)) return null;
  const buttonClass = "rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
  const contents = <>
    <p className="font-semibold">{error ? copy.attention : pending ? formatCopy(copy.waiting, { count: pending }) : copy.none}</p>
    <p className="mt-1 text-sm">{copy.safety}</p>
    {(error || status) && <p role={error ? "alert" : "status"} className="mt-2 text-sm">{error || status}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy || !!error} className={buttonClass} onClick={async () => {
        const requestOwner = user.uid;
        setBusy(true); setStatus("");
        try {
          await withDeadline(flushOfflineSyncQueue(user.uid), 15000);
          const remaining = getOfflineSyncQueue().filter(item => item.userId === user.uid && item.status !== "synced").length;
          if (ownerRef.current === requestOwner) setStatus(remaining ? copy.remaining : copy.complete);
        } catch (error) { if (ownerRef.current === requestOwner) setStatus(error instanceof Error ? error.message : copy.failed); }
        finally { if (ownerRef.current === requestOwner) { refresh(); setBusy(false); } }
      }}>{busy ? copy.syncing : copy.retry}</button>
      <button type="button" disabled={!!error} className={buttonClass} onClick={() => {
        try {
          const url = URL.createObjectURL(new Blob([exportPendingChanges(user.uid)], {type:"application/json"}));
          const link = document.createElement("a"); link.href = url; link.download = "noviq-pending-changes.json"; link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { setStatus(error instanceof Error ? error.message : copy.exportFailed); }
      }}>{copy.export}</button>
      {alwaysVisible && <>
        <button type="button" disabled={busy || !!error} className={buttonClass} onClick={() => fileRef.current?.click()}>{copy.import}</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label={copy.backup} onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
          try {
            if (file.size > 10 * 1024 * 1024) throw new Error(copy.tooLarge);
            const count = importPendingChanges(user.uid, await file.text());
            setStatus(formatCopy(copy.imported, { count })); refresh();
          } catch (error) { setStatus(error instanceof Error ? error.message : copy.importFailed); }
        }}/>
      </>}
    </div>
  </>;
  if (alwaysVisible) return <section className="sync-recovery-card mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-slate-900" aria-label={copy.region}>{contents}</section>;
  return <section className="relative z-40 mb-2 shrink-0 text-slate-900" aria-label={copy.region}>
    <details open={expanded} onKeyDown={event => { if (event.key === "Escape") { setExpanded(false); (event.currentTarget.querySelector("summary") as HTMLElement)?.focus(); } }}>
      <summary onClick={event => { event.preventDefault(); setExpanded(value => !value); }} className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
        <CloudUpload size={16} className="shrink-0 text-amber-700" aria-hidden="true" />
        <span className="min-w-0 flex-1">{error ? t("sync.errorSummary") : t("sync.pendingSummary", { count: pending })}</span>
        <span className="shrink-0 text-amber-800">{t("sync.details")}</span>
        <ChevronDown size={15} className={expanded ? "rotate-180" : ""} aria-hidden="true" />
      </summary>
      <div className="absolute inset-x-0 top-full mt-2 max-h-[65dvh] overflow-y-auto rounded-2xl border border-amber-200 bg-white p-4 shadow-xl" style={{background:"var(--noviq-card)",color:"var(--noviq-text)"}}>{contents}</div>
    </details>
  </section>;
};
