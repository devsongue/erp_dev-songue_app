import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/crm')({
  component: CrmLayout,
})

function CrmLayout() {
  return (
    <div className="app-page-bg flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
