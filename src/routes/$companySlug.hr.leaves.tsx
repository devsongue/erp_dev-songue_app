import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/$companySlug/hr/leaves')({
  component: () => <GenericScreen title="Leaves" description="Tableau de bord de gestion pour leaves" />,
})
