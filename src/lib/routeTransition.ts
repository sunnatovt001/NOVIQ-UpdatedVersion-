import { flushSync } from 'react-dom';
import './routeTransition.css';

type PageTransition = { finished: Promise<void>; skipTransition: () => void };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => PageTransition };
let activeTransition: PageTransition | undefined;

/** Snapshot the outgoing page while keeping the live sidebar mounted. */
export function transitionRoute(commit: () => void) {
  const doc = document as TransitionDocument;
  activeTransition?.skipTransition();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !doc.startViewTransition || document.visibilityState === 'hidden') {
    document.documentElement.dataset.routeMotion = reduced ? 'reduced' : 'fallback';
    flushSync(commit);
    return;
  }
  document.documentElement.dataset.routeMotion = 'view';
  try {
    const transition = doc.startViewTransition(() => flushSync(commit));
    activeTransition = transition;
    void transition.finished.catch(() => {}).finally(() => {
      if (activeTransition === transition) activeTransition = undefined;
    });
  } catch {
    document.documentElement.dataset.routeMotion = 'fallback';
    flushSync(commit);
  }
}
