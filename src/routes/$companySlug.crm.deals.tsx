import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/crm/deals')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/crm', params })
  },
})
