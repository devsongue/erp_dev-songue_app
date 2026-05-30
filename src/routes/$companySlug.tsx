import { createFileRoute, Outlet, Link, redirect, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Contact,
  FileCheck2,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Plus,
  ReceiptText,
  Settings,
  ShoppingCart,
  Sun,
  Truck,
  Users,
} from 'lucide-react'
import * as React from 'react'
import { CompanyProvider, useCompany } from '~/context/CompanyContext'
import { getCompanyAuthState, logout, createCompany } from '~/server/auth'

export const Route = createFileRoute('/$companySlug')({
  beforeLoad: async ({ params, location }) => {
    const auth = await getCompanyAuthState({ data: { companySlug: params.companySlug } })

    if (!auth.user) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }

    if (!auth.canAccessCompany) {
      const firstCompany = auth.companies[0]
      if (firstCompany) {
        throw redirect({
          to: '/$companySlug/dashboard',
          params: { companySlug: firstCompany.slug },
        })
      }

      throw redirect({ to: '/login', search: { redirect: undefined } })
    }

    return auth
  },
  component: CompanyLayout,
})

function CompanyLayout() {
  const { companySlug } = Route.useParams()
  const auth = Route.useRouteContext()

  return (
    <CompanyProvider activeCompanySlug={companySlug} companies={auth.companies}>
      <ErpAppShell companySlug={companySlug}>
        <Outlet />
      </ErpAppShell>
    </CompanyProvider>
  )
}

const mobileLinks = [
  { path: '/pos/register', label: 'Caisse' },
  { path: '/dashboard', label: 'Resume' },
  { path: '/sales', label: 'Ventes' },
  { path: '/inventory', label: 'Stock' },
  { path: '/crm', label: 'Clients' },
]

type SidebarChild = {
  path: string
  label: string
  icon: any
  exact?: boolean
}

type SidebarSection = {
  label: string
  icon: any
  children: SidebarChild[]
}

const erpNavigation: Array<{ label: string; sections: SidebarSection[] }> = [
  {
    label: 'Caisse & ventes',
    sections: [
      {
        label: 'Caisse',
        icon: ShoppingCart,
        children: [
          { path: '/pos', label: 'Resume caisse', icon: BarChart3, exact: true },
          { path: '/pos/register', label: 'Nouvelle vente', icon: ShoppingCart },
          { path: '/pos/history', label: 'Tickets', icon: History },
          { path: '/pos/sales-report', label: 'Rapport caisse', icon: ReceiptText },
        ],
      },
      {
        label: 'Documents vente',
        icon: ReceiptText,
        children: [
          { path: '/sales', label: 'Resume ventes', icon: LayoutDashboard, exact: true },
          { path: '/quotes', label: 'Devis', icon: FileCheck2, exact: true },
          { path: '/invoices', label: 'Factures', icon: ReceiptText, exact: true },
        ],
      },
      {
        label: 'Clients',
        icon: Contact,
        children: [
          { path: '/crm', label: 'Resume clients', icon: LayoutDashboard, exact: true },
          { path: '/crm/leads', label: 'Ajouter client', icon: Plus },
        ],
      },
    ],
  },
  {
    label: 'Stock & achats',
    sections: [
      {
        label: 'Produits',
        icon: Package,
        children: [
          { path: '/products-services', label: 'Produits & services', icon: Package, exact: true },
        ],
      },
      {
        label: 'Stock',
        icon: Boxes,
        children: [
          { path: '/inventory', label: 'Resume stock', icon: LayoutDashboard, exact: true },
          { path: '/inventory/transfers', label: 'Mouvements', icon: ArrowRightLeft },
        ],
      },
      {
        label: 'Achats',
        icon: Truck,
        children: [
          { path: '/purchases', label: 'Resume achats', icon: LayoutDashboard, exact: true },
          { path: '/purchases/vendors', label: 'Fournisseurs', icon: Building2 },
          { path: '/purchases/invoices', label: 'Factures achats', icon: FileText },
        ],
      },
    ],
  },
  {
    label: 'Argent',
    sections: [
      {
        label: 'Finance',
        icon: CircleDollarSign,
        children: [
          { path: '/finance', label: 'Resume argent', icon: LayoutDashboard, exact: true },
          { path: '/finance/revenues', label: 'Entrees', icon: ArrowUpRight },
          { path: '/finance/expenses', label: 'Depenses', icon: ArrowDownRight },
          { path: '/finance/bank-accounts', label: 'Comptes & caisse', icon: Landmark },
        ],
      },
      {
        label: 'Rapports',
        icon: ReceiptText,
        children: [
          { path: '/reports', label: 'Rapport activite', icon: BarChart3, exact: true },
        ],
      },
    ],
  },
  {
    label: 'Systeme',
    sections: [
      {
        label: 'Administration',
        icon: Settings,
        children: [
          { path: '/settings', label: 'Parametres', icon: Settings, exact: true },
          { path: '/users', label: 'Utilisateurs', icon: Users, exact: true },
        ],
      },
    ],
  },
]

function ErpAppShell({ children, companySlug }: { children: React.ReactNode, companySlug: string }) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const [showCreateCompanyModal, setShowCreateCompanyModal] = React.useState(false)
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('erp-theme') === 'light' ? 'light' : 'dark'
  })
  const { activeCompany } = useCompany()
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const auth = Route.useRouteContext()
  const currentSubPath = `/${pathname.split('/').filter(Boolean).slice(1).join('/')}`

  function buildCompanyPath(nextCompanySlug: string) {
    const parts = pathname.split('/').filter(Boolean)
    const currentPage = parts.slice(1).join('/')
    return `/${nextCompanySlug}${currentPage ? `/${currentPage}` : '/dashboard'}`
  }

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-light', theme === 'light')
    root.classList.toggle('theme-dark', theme === 'dark')
    root.style.colorScheme = theme
    window.localStorage.setItem('erp-theme', theme)
  }, [theme])

  return (
    <div className="neon-grid min-h-screen text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[17rem] border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4">
          <span className="grid size-8 place-items-center rounded bg-gradient-to-br from-slate-800 to-slate-950 text-xs font-bold text-white shadow-[0_0_24px_rgba(0,229,153,0.22)]">
            GP
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Application
            </span>
            <span className="block text-sm font-bold text-slate-950">Gestion PME</span>
          </span>
        </div>

        <div className="relative border-b border-slate-200 p-3" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`group flex w-full items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-slate-50 ${isDropdownOpen ? 'bg-slate-50' : ''}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className={`flex size-7 shrink-0 items-center justify-center rounded font-bold text-white ${activeCompany.color}`}>
                {activeCompany.initial}
              </div>
              <div className="flex min-w-0 flex-col items-start">
                <span className="block max-w-40 truncate text-sm font-bold text-slate-950">{activeCompany.name}</span>
                <span className="block max-w-40 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{activeCompany.group}</span>
              </div>
            </div>
            <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded border border-slate-200 bg-white py-1">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vos entreprises</p>
              </div>
              {auth.companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    setIsDropdownOpen(false)
                    void navigate({ to: buildCompanyPath(company.slug) as any })
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded bg-slate-950 text-[10px] font-bold text-white">
                      {company.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className={`truncate font-semibold ${company.slug === companySlug ? 'text-slate-950' : 'text-slate-700'}`}>
                      {company.name}
                    </span>
                  </div>
                  {company.slug === companySlug && <Check className="size-4 text-slate-950" />}
                </button>
              ))}
              {auth.user?.isOwner && (
                <div className="mt-1 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false)
                      setShowCreateCompanyModal(true)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
                  >
                    <Plus className="size-4" />
                    Ajouter une activité
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-1">
            <SidebarLink to={`/${companySlug}/pos/register`} icon={ShoppingCart} featured>
              Nouvelle vente
            </SidebarLink>
            <SidebarLink to={`/${companySlug}/dashboard`} icon={LayoutDashboard}>
              Resume
            </SidebarLink>
          </div>

          <div className="mt-5 space-y-4">
            {erpNavigation.map((group) => (
              <div key={group.label}>
                <h2 className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {group.label}
                </h2>
                <div className="mt-2 space-y-1">
                  {group.sections.map((section) => (
                    <SidebarMenu
                      key={section.label}
                      section={section}
                      companySlug={companySlug}
                      currentSubPath={currentSubPath}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            onClick={async () => {
              await logout()
              await navigate({ to: '/login', search: { redirect: undefined } })
            }}
            className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
          >
            <LogOut className="size-4" />
            Deconnexion
          </button>
        </div>
      </aside>

      <div className="lg:pl-[17rem]">
        <header className="app-header sticky top-0 z-10 border-b shadow-sm backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`hidden size-9 shrink-0 items-center justify-center rounded font-bold text-white sm:flex ${activeCompany.color}`}>
                {activeCompany.initial}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Espace de travail
                </p>
                <h1 className="truncate text-sm font-bold text-slate-950">{activeCompany.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeSwitch theme={theme} onToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} />
              <Link
                to="/$companySlug/settings"
                params={{ companySlug }}
                className="hidden h-9 items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:inline-flex"
              >
                Parametres
              </Link>
              <div className="flex size-9 items-center justify-center rounded bg-slate-950 text-xs font-bold text-white" title={auth.user?.email ?? ''}>
                {(auth.user?.email ?? 'U').slice(0, 1).toUpperCase()}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
            {mobileLinks.map((item) => (
              <Link
                key={item.path}
                to={`/${companySlug}${item.path}` as any}
                className="shrink-0 rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300"
                activeProps={{ className: 'border-slate-950 bg-slate-950 text-white hover:border-slate-950' }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </header>
        <main>{children}</main>
      </div>
      <CreateCompanyModal isOpen={showCreateCompanyModal} onClose={() => setShowCreateCompanyModal(false)} />
    </div>
  )
}

function ThemeSwitch({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-9 items-center gap-2 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Mode sombre' : 'Mode clair'}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      <span className="hidden sm:inline">{isDark ? 'Sombre' : 'Clair'}</span>
    </button>
  )
}

function SidebarMenu({
  section,
  companySlug,
  currentSubPath,
}: {
  section: SidebarSection
  companySlug: string
  currentSubPath: string
}) {
  const isSectionActive = section.children.some((item) => isPathActive(currentSubPath, item.path, item.exact))
  const [isOpen, setIsOpen] = React.useState(isSectionActive)
  const Icon = section.icon

  React.useEffect(() => {
    if (isSectionActive) setIsOpen(true)
  }, [isSectionActive])

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100 hover:text-slate-950 ${
          isSectionActive ? 'bg-slate-100 text-slate-950 font-bold' : 'text-slate-600'
        }`}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
        <ChevronRight className={`size-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {isOpen ? (
        <div className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-2">
          {section.children.map((item) => (
            <SidebarSubLink
              key={`${section.label}-${item.path}-${item.label}`}
              item={item}
              to={`/${companySlug}${item.path}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SidebarSubLink({ item, to }: { item: SidebarChild; to: string }) {
  const Icon = item.icon

  return (
    <Link
      to={to as any}
      activeOptions={{ exact: item.exact ?? false }}
      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
      activeProps={{ className: 'bg-slate-100 text-slate-950 font-bold' }}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  )
}

function isPathActive(currentPath: string, targetPath: string, exact = false) {
  if (exact) return currentPath === targetPath
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
}

function SidebarLink({
  to,
  icon: Icon,
  children,
  badge,
  featured = false,
}: {
  to: string
  icon: any
  children: React.ReactNode
  badge?: string
  featured?: boolean
}) {
  return (
    <Link
      to={to as any}
      activeProps={{
        className: featured
          ? 'bg-slate-950 text-white font-bold'
          : 'border-l-2 border-slate-950 pl-2.5 bg-slate-100 text-slate-950 font-bold hover:bg-slate-100',
      }}
      className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
        featured
          ? 'bg-slate-950 text-white hover:bg-slate-800 font-semibold'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">{badge}</span> : null}
    </Link>
  )
}

function CreateCompanyModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (isOpen) {
      setName('')
      setSlug('')
      setError(null)
    }
  }, [isOpen])

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setName(val)
    const autoSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
    setSlug(autoSlug)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await createCompany({ data: { name: name.trim(), slug: slug.trim() } })
      if (res.ok && res.companySlug) {
        window.location.href = `/${res.companySlug}/dashboard`
      } else {
        setError(res.message || 'Une erreur est survenue.')
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-950">Ajouter une activité</h2>
        <p className="mt-1 text-xs text-slate-500">Créez un espace séparé pour une boutique, agence ou succursale.</p>
        
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Nom</span>
            <input
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="Ex: Boutique Plateau"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950"
            />
          </label>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSubmitting ? 'Création...' : "Créer l'activité"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
