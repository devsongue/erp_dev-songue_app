import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/sales/invoices')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/invoices', params })
  },
})
