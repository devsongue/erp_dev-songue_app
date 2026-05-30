export type SalesStatus = 'Draft' | 'Confirmed' | 'Preparing' | 'Delivered' | 'Invoiced' | 'Paid' | 'Overdue' | 'Returned'
export type PaymentMethod = 'Cash' | 'Card' | 'Mobile Money' | 'Transfer'

export interface SalesOrder {
  id: string
  reference: string
  customer: string
  status: SalesStatus
  date: string
  amount: number
  margin: number
  channel: 'Commercial' | 'POS' | 'Web'
}

export interface PosTicket {
  id: string
  reference: string
  cashier: string
  customer: string
  paymentMethod: PaymentMethod
  amount: number
  items: number
  date: string
}

export const salesOrders: SalesOrder[] = []
export const posTickets: PosTicket[] = []

export function salesStatusLabel(status: SalesStatus) {
  if (status === 'Draft') return 'Brouillon'
  if (status === 'Confirmed') return 'Confirmee'
  if (status === 'Preparing') return 'Preparation'
  if (status === 'Delivered') return 'Livree'
  if (status === 'Invoiced') return 'Facturee'
  if (status === 'Paid') return 'Payee'
  if (status === 'Overdue') return 'En retard'
  return 'Retournee'
}
