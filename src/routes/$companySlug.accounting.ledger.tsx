import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/accounting/ledger')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/finance/revenues', params })
  },
})
