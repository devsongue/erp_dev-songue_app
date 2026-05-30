import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/finance/vendor-payments')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/finance/expenses', params })
  },
})
