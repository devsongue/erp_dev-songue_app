import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/sales/returns')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/sales', params })
  },
})
