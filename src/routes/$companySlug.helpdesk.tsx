import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/helpdesk')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/settings', params })
  },
})
