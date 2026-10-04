import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { isReadOnlyAudit } from "./auditMode";

export function useCommunityPresence(uid?: string) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!uid || isReadOnlyAudit) return;
    const sessionId = crypto.randomUUID();
    const update = httpsCallable(functions, "updateCommunityPresence", { timeout: 10000 });
    let live = true, pending = false, queued = false;
    const heartbeat = async () => {
      if (pending) { queued = true; return; }
      pending = true;
      try {
        await update({ sessionId, online: live && document.visibilityState === "visible" && navigator.onLine });
        if (live) setError("");
      } catch {
        if (live) setError("Your online status could not be updated. The app will retry automatically.");
      } finally {
        pending = false;
        if (queued) { queued = false; void heartbeat(); }
      }
    };
    void heartbeat();
    const timer = window.setInterval(heartbeat, 45000);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("online", heartbeat);
    window.addEventListener("offline", heartbeat);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
      window.removeEventListener("online", heartbeat);
      window.removeEventListener("offline", heartbeat);
      void heartbeat();
    };
  }, [uid]);
  return error;
}
