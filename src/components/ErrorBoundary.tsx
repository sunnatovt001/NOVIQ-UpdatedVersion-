import React from "react";

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
    if (this.state.failed)
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-6 text-center text-[#111827]"
        >
          <h1 className="text-xl font-bold">This page could not be loaded</h1>
          <p className="text-sm text-[#6B7280]">
            Please reload to return to your workspace.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[#3F7D58] px-5 py-3 font-bold text-white"
          >
            Reload page
          </button>
        </div>
      );
    return this.props.children;
  }
}
