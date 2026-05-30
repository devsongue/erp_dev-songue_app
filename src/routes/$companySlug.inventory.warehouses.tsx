import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/inventory/warehouses')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/inventory', params })
  },
})
