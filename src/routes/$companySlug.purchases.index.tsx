import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/$companySlug/purchases/')({
  component: () => <GenericScreen title="purchases" description="Tableau de bord de gestion pour purchases" />,
})
