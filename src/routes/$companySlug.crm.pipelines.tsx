import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/crm/pipelines')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/crm', params })
  },
})
