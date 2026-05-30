export type PosPaymentProvider = 'Orange Money' | 'MTN Money' | 'Wave' | 'Visa' | 'Mastercard' | 'Cash'
export type PosTicketStatus = 'Paid' | 'Cancelled' | 'Refunded' | 'CreditNote'

export interface PosCustomer {
  id: string
  name: string
  phone: string
  email: string
  loyaltyPoints: number
  totalSpent: number
  segment: 'VIP' | 'Regulier' | 'Nouveau'
  lastPurchase: string
}

export interface PosVariant {
  id: string
  productId: string
  size?: string
  color?: string
  weight?: string
  barcode: string
  stock: number
}

export interface PosSupplier {
  id: string
  name: string
  phone: string
  pendingOrders: number
}

export interface PosPurchaseOrder {
  id: string
  reference: string
  supplier: string
  status: 'Draft' | 'Ordered' | 'Received'
  amount: number
  eta: string
}

export interface PosStockMovement {
  id: string
  product: string
  type: 'Sale' | 'Return' | 'Supply' | 'Adjustment'
  quantity: number
  at: string
}

export interface PosHistoryTicket {
  id: string
  reference: string
  customer: string
  total: number
  paidCash: number
  paidMobile: number
  paidCard: number
  status: PosTicketStatus
  cashier: string
  createdAt: string
}

export const posCustomers: PosCustomer[] = []
export const posVariants: PosVariant[] = []
export const posSuppliers: PosSupplier[] = []
export const posPurchaseOrders: PosPurchaseOrder[] = []
export const posStockMovements: PosStockMovement[] = []
export const posHistoryTickets: PosHistoryTicket[] = []
export const posHourlySales: Array<{ hour: string; amount: number }> = []
export const posTopProducts: Array<{ name: string; sold: number; revenue: number }> = []
