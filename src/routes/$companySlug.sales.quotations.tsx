import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/sales/quotations')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/quotes', params })
  },
})
