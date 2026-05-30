import { createFileRoute } from '@tanstack/react-router'
import { GenericScreen } from '~/components/GenericScreen'

export const Route = createFileRoute('/users')({
  component: () => <GenericScreen title="users" description="Tableau de bord de gestion pour users" />,
})
