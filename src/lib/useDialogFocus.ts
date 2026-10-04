import { useEffect, useRef, type RefObject } from "react";

export const useDialogFocus = (open: boolean, container: RefObject<HTMLElement | null>, close: () => void) => {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || !container.current) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = container.current;
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (focusable()[0] || root).focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); root.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("keydown", handleKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [open, container]);
};
