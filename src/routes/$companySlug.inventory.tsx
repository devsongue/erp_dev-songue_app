import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/inventory')({
  component: InventoryLayout,
})

function InventoryLayout() {
  return (
    <div className="app-page-bg flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
