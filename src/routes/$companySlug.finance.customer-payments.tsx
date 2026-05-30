import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/finance/customer-payments')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/finance/revenues', params })
  },
})
