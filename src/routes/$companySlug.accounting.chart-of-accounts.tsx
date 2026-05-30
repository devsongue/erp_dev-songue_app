import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/accounting/chart-of-accounts')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/finance/bank-accounts', params })
  },
})
