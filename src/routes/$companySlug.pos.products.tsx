import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/pos/products')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$companySlug/products-services',
      params,
    })
  },
})
