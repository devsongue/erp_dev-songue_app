import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    // Les donnees d'un loader restent valides 30 s : naviguer entre les pages
    // d'un module ne refait pas les appels serveur. Les mutations forcent le
    // rechargement via router.invalidate().
    defaultStaleTime: 30_000,
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })
  return router
}
