import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/pos/customers')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$companySlug/crm',
      params,
    })
  },
})
