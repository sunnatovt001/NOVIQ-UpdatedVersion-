import React from "react";
import { getRecoveryCopy } from "@/src/lib/recoveryCopy";

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Page rendering failed", error, info);
  }
  render() {
    const copy = getRecoveryCopy();
    if (this.state.failed)
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-6 text-center text-[#111827]"
        >
          <h1 className="text-xl font-bold">{copy.title}</h1>
          <p className="text-sm text-[#6B7280]">
            {copy.reloadHelp}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
          >
            {copy.reloadPage}
          </button>
        </div>
      );
    return this.props.children;
  }
}
