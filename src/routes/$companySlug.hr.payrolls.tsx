import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/$companySlug/hr/payrolls')({
  component: () => <GenericScreen title="Payrolls" description="Tableau de bord de gestion pour payrolls" />,
})
