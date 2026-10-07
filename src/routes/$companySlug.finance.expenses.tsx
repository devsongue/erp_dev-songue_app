import { createFileRoute } from '@tanstack/react-router'
import { FinanceFlowPage } from '~/components/finance'
import { getFinanceData } from '~/server/dataFetchers'

export const Route = createFileRoute('/$companySlug/finance/expenses')({
  loader: async ({ params }) => getFinanceData({ data: { companySlug: params.companySlug } }),
  component: ExpensesPage,
})

function ExpensesPage() {
  const { companySlug } = Route.useParams()
  return <FinanceFlowPage companySlug={companySlug} data={Route.useLoaderData()} kind="Expense" />
}
