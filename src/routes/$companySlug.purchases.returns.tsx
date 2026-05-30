import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/purchases/returns')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/purchases', params })
  },
})
