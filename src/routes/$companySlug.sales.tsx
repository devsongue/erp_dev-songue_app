import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/sales')({
  component: SalesLayout,
})

function SalesLayout() {
  return (
    <div className="app-page-bg flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
