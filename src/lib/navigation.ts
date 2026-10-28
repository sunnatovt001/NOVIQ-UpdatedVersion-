export const pageNames = ['dashboard', 'planner', 'tutor', 'notes', 'flashcards', 'focus', 'community', 'analytics', 'pricing', 'admin', 'profile', 'onboarding'];

export function writePagePath(page: string) {
  const path = page === 'landing' ? '/' : `/${page.replace(/^\//, '')}`;
  const url = path + window.location.search;
  if (window.location.pathname + window.location.search + window.location.hash !== url) {
    window.history.pushState(null, '', url);
  }
}

export function navigateToPage(page: string) {
  writePagePath(page);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function installPageNavigation() {
  const migrateLegacyRoute = () => {
    const page = window.location.hash.replace(/^#\//, '').replace(/\/$/, '');
    if (pageNames.includes(page)) {
      window.history.replaceState(null, '', `/${page}${window.location.search}`);
    }
  };
  migrateLegacyRoute();
  window.addEventListener('hashchange', () => {
    migrateLegacyRoute();
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.hash || (url.pathname !== '/' && !pageNames.includes(url.pathname.replace(/^\//, '').replace(/\/$/, '')))) return;
    event.preventDefault();
    window.history.pushState(null, '', url.pathname + url.search);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
