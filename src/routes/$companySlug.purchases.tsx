import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/purchases')({
  component: () => <Outlet />,
})
