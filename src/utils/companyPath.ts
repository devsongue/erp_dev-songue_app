import { useParams } from '@tanstack/react-router'

/**
 * Hook to get the current company slug from the URL.
 * Used to build company-scoped links.
 */
export function useCompanySlug(): string {
  const params = useParams({ strict: false }) as { companySlug?: string }
  return params.companySlug || 'nova-ci'
}

/**
 * Build a company-scoped path.
 * e.g. companyPath('/crm') with slug 'nova-ci' => '/nova-ci/crm'
 */
export function companyPath(slug: string, path: string): string {
  return `/${slug}${path}`
}
