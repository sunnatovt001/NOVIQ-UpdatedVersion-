import { useEffect } from "react";

export function useNotificationDismiss(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('[data-notification-panel], [data-notification-trigger]')) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);
}
