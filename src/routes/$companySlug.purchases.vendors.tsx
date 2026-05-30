import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/$companySlug/purchases/vendors')({
  component: () => <GenericScreen title="Vendors" description="Tableau de bord de gestion pour vendors" />,
})
