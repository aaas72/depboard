import { useMemo, useSyncExternalStore } from 'react';

/**
 * Two screens, addressed by the URL hash so Back and Forward work and nothing needs a router:
 * `#/` is the matrix (the default, always first on launch), `#/project/<id>` is one project.
 */
export type Route = { view: 'matrix' } | { view: 'project'; projectId: string };

const PROJECT = /^#\/project\/([\w-]{1,64})$/;

export function parseRoute(hash: string): Route {
  const match = PROJECT.exec(hash);
  return match?.[1] ? { view: 'project', projectId: match[1] } : { view: 'matrix' };
}

export function routeHref(route: Route): string {
  return route.view === 'project' ? `#/project/${route.projectId}` : '#/';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/** The current screen, following Back, Forward, and links. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseRoute(hash), [hash]);
}
