import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/$companySlug/hr/attendances')({
  component: () => <GenericScreen title="Attendances" description="Tableau de bord de gestion pour attendances" />,
})
