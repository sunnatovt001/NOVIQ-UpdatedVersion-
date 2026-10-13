import { useState } from "react";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getAppCopy } from "./appCopy";
import "./AppLoadingScreen.css";

export const AppLoadingScreen = ({ message }: { message?: string }) => {
  const { locale } = useLocale();
  const [dark] = useState(() => {
    try { return window.localStorage.getItem("noviq-theme") === "dark"; }
    catch { return false; }
  });

  return (
    <div
      className={`noviq-app ${dark ? "dark" : ""} fixed inset-0 z-[200] flex items-center justify-center bg-[var(--noviq-bg)] p-6 text-[var(--noviq-text)]`}
      data-app-loading
    >
      <div role="status" aria-live="polite" className="flex max-w-sm flex-col items-center text-center">
        <div className="noviq-loading-mark" aria-hidden="true">
        <span className="noviq-loading-ring" />
        <img
          src="/noviq-logo.jpeg"
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 rounded-2xl border border-[var(--noviq-border)] object-cover"
        />
        </div>
        <p className="mt-5 text-sm font-medium leading-6 text-[var(--noviq-muted)]">
          {message || getAppCopy(locale).preparing}
        </p>
      </div>
    </div>
  );
};
