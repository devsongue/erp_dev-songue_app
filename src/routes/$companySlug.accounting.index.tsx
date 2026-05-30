import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/accounting/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/finance', params })
  },
})
