import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$companySlug/dashboard',
      params: { companySlug: params.companySlug },
    })
  },
})
