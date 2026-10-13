import React, { Suspense, useMemo, useState } from "react";
import { withDeadline } from "@/src/lib/asyncRequest";
import { reportClientError } from "@/src/lib/errorReporting";
import { getRecoveryCopy } from "@/src/lib/recoveryCopy";

export const createLazyPage = (loader: () => Promise<Record<string, any>>, name: string) =>
  React.lazy(async () => {
    const module = await withDeadline(loader(), 15000);
    if (!module[name]) throw new Error(`Page export ${name} is missing`);
    return { default: module[name] };
  });

// Cache component definitions only, never account data or rendered page state.
type PageLoader = () => Promise<Record<string, any>>;
const lazyPages = new WeakMap<PageLoader, Map<string, ReturnType<typeof createLazyPage>>>();
export const getCachedLazyPage = (loader: PageLoader, name: string, retry = false) => {
  let pages = lazyPages.get(loader);
  if (!pages) { pages = new Map(); lazyPages.set(loader, pages); }
  let page = pages.get(name);
  if (!page || retry) { page = createLazyPage(loader, name); pages.set(name, page); }
  return page;
};

export class PageBoundary extends React.Component<React.PropsWithChildren<{ retry: () => void; fallback?: React.ReactNode }>, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError("route",error);
    console.error("Route loading/rendering failed", { route: window.location.hash || window.location.pathname, error, componentStack: info.componentStack });
  }
  render() {
    const copy = getRecoveryCopy();
    if (this.state.error && this.props.fallback) return this.props.fallback;
    if (this.state.error) return <div role="alert" className="mx-auto my-12 max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center text-slate-900 dark:border-red-500/30 dark:bg-slate-900 dark:text-slate-50">
      <h1 className="text-xl font-bold">{copy.title}</h1>
      <p className="my-4">{copy.retryHelp}</p>
      <button onClick={this.props.retry} className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">{copy.retry}</button>
      <button onClick={() => window.location.reload()} className="ml-3 min-h-11 underline">{copy.reloadApp}</button>
    </div>;
    return this.props.children;
  }
}

// A rejected React.lazy promise is cached; retry must create a new lazy type.
export function RoutePage({ loader, name, pageProps }: { loader: () => Promise<Record<string, any>>; name: string; pageProps?: Record<string, unknown> }) {
  const [attempt, setAttempt] = useState(0);
  const Page = useMemo(() => getCachedLazyPage(loader, name, attempt > 0), [loader, name, attempt]);
  return <PageBoundary key={`${name}:${attempt}`} retry={() => setAttempt(value => value + 1)}>
    <Suspense fallback={<div role="status" className="p-12 text-center">{getRecoveryCopy().loading}</div>}><Page {...pageProps} /></Suspense>
  </PageBoundary>;
}
