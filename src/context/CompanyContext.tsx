import React, { createContext, useContext, ReactNode } from 'react'

export type CompanyId = string

export interface Company {
  id: CompanyId
  slug: string
  name: string
  logoUrl?: string | null
  group: string
  initial: string
  color: string
}

interface CompanyContextType {
  activeCompanyId: CompanyId
  setActiveCompanyId: (id: CompanyId) => void
  activeCompany: Company
  companies: Company[]
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined)

export function CompanyProvider({
  children,
  activeCompanySlug,
  companies,
}: {
  children: ReactNode
  activeCompanySlug: string
  companies: Array<{ id: string; name: string; slug: string; logoUrl?: string | null }>
}) {
  const normalizedCompanies = companies.map((company, index) => ({
    id: company.slug,
    slug: company.slug,
    name: company.name,
    logoUrl: company.logoUrl ?? null,
    group: 'Entreprise',
    initial: company.name.slice(0, 1).toUpperCase(),
    color: companyColors[index % companyColors.length],
  }))

  const fallbackCompany = {
    id: activeCompanySlug,
    slug: activeCompanySlug,
    name: activeCompanySlug,
    logoUrl: null,
    group: 'Entreprise',
    initial: activeCompanySlug.slice(0, 1).toUpperCase(),
    color: companyColors[0],
  }

  const activeCompany =
    normalizedCompanies.find((company) => company.slug === activeCompanySlug) ??
    normalizedCompanies[0] ??
    fallbackCompany

  return (
    <CompanyContext.Provider
      value={{
        activeCompanyId: activeCompany.slug,
        setActiveCompanyId: () => {},
        activeCompany,
        companies: normalizedCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const context = useContext(CompanyContext)
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider')
  }
  return context
}

const companyColors = ['bg-slate-950', 'bg-slate-700', 'bg-slate-600', 'bg-slate-500']
