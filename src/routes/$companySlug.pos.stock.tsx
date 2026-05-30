import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/pos/stock')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$companySlug/inventory',
      params,
    })
  },
})
