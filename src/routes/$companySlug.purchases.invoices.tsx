import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/$companySlug/purchases/invoices')({
  component: () => <GenericScreen title="Invoices" description="Tableau de bord de gestion pour invoices" />,
})
