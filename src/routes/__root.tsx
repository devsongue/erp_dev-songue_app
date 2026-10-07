/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      ...seo({
        title: 'DevSongue Business',
        description: 'Application web simple pour ventes, caisse, stock, clients et factures.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

// Charge les devtools uniquement en dev : le composant est retire du bundle
// de production (import dynamique elimine par import.meta.env.PROD).
const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : React.lazy(() =>
      import('@tanstack/react-router-devtools').then((module) => ({
        default: module.TanStackRouterDevtools,
      })),
    )

const themeBootstrap = `(function(){try{var s=localStorage.getItem('erp-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;c.toggle('theme-dark',d);c.toggle('theme-light',!d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`

function RootDocument({ children }: { children: React.ReactNode }) {
  // Apres un redeploy, les chunks hashes changent de nom : un onglet deja ouvert
  // qui charge une route en lazy demande un ancien fichier qui n'existe plus (404)
  // -> "Failed to fetch dynamically imported module". Vite emet `vite:preloadError`
  // dans ce cas : on recharge une seule fois pour recuperer le HTML et les assets
  // frais (garde anti-boucle si le chunk manque toujours apres rechargement).
  React.useEffect(() => {
    function onPreloadError(event: Event) {
      const key = 'chunk-reload-at'
      const last = Number(sessionStorage.getItem(key) ?? 0)
      if (Date.now() - last < 10000) return
      sessionStorage.setItem(key, String(Date.now()))
      event.preventDefault()
      window.location.reload()
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [])

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Theme pose avant le premier rendu (pas de flash) : choix memorise,
            sinon reglage du telephone / de l'ordinateur, sinon clair. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <React.Suspense>
          <TanStackRouterDevtools position="bottom-right" />
        </React.Suspense>
        <Scripts />
      </body>
    </html>
  )
}
