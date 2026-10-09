import { useEffect, useRef, type RefObject } from "react";

export const useDialogFocus = (open: boolean, container: RefObject<HTMLElement | null>, close: () => void) => {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || !container.current) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = container.current;
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]')).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (focusable()[0] || root).focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); root.focus(); }
      else if (!root.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const containFocus = (event: FocusEvent) => {
      if (!root.contains(event.target as Node)) (focusable()[0] || root).focus();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", containFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("focusin", containFocus);
      // Portal background inertness is restored by the owning dialog's cleanup.
      queueMicrotask(() => { if (opener?.isConnected) opener.focus(); });
    };
  }, [open, container]);
};
