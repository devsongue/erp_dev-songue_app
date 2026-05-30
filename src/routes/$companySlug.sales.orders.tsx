import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/sales/orders')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/sales', params })
  },
})
