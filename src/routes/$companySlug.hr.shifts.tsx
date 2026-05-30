import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/$companySlug/hr/shifts')({
  component: () => <GenericScreen title="Shifts" description="Tableau de bord de gestion pour shifts" />,
})
