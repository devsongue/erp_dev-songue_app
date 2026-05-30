import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/pos/analytics')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/pos/sales-report', params })
  },
})
