import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/projects')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/dashboard', params })
  },
})
