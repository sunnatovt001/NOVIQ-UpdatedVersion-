import React, { Suspense, useMemo, useState } from "react";
import { withDeadline } from "@/src/lib/asyncRequest";
import { reportClientError } from "@/src/lib/errorReporting";

export const createLazyPage = (loader: () => Promise<Record<string, any>>, name: string) =>
  React.lazy(async () => {
    const module = await withDeadline(loader(), 15000);
    if (!module[name]) throw new Error(`Page export ${name} is missing`);
    return { default: module[name] };
  });

class PageBoundary extends React.Component<React.PropsWithChildren<{ retry: () => void }>, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError("route",error);
    console.error("Route loading/rendering failed", { route: window.location.hash || window.location.pathname, error, componentStack: info.componentStack });
  }
  render() {
    if (this.state.error) return <div role="alert" className="mx-auto my-12 max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center text-slate-900">
      <h1 className="text-xl font-bold">This page could not be loaded</h1>
      <p className="my-4">Check your connection and try again. Your saved data is unchanged.</p>
      <button onClick={this.props.retry} className="btn-primary px-5 py-3">Retry page</button>
      <button onClick={() => window.location.reload()} className="ml-3 underline">Reload app</button>
    </div>;
    return this.props.children;
  }
}

// A rejected React.lazy promise is cached; retry must create a new lazy type.
export function RoutePage({ loader, name, pageProps }: { loader: () => Promise<Record<string, any>>; name: string; pageProps?: Record<string, unknown> }) {
  const [attempt, setAttempt] = useState(0);
  const Page = useMemo(() => createLazyPage(loader, name), [loader, name, attempt]);
  return <PageBoundary key={`${name}:${attempt}`} retry={() => setAttempt(value => value + 1)}>
    <Suspense fallback={<div role="status" className="p-12 text-center">Loading page…</div>}><Page {...pageProps} /></Suspense>
  </PageBoundary>;
}
