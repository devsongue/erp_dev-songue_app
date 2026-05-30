import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/accounting/trial-balance')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/reports', params })
  },
})
