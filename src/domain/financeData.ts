export type TransactionType = 'Income' | 'Expense'
export type TransactionStatus = 'Completed' | 'Pending' | 'Failed'
export type AccountType = 'Bank' | 'Cash' | 'CreditCard'

export interface BankAccount {
  id: string
  name: string
  accountNumber: string
  type: AccountType
  balance: number
  currency: string
  bankName: string
}

export interface FinancialTransaction {
  id: string
  date: string
  description: string
  type: TransactionType
  amount: number
  currency: string
  category: string
  accountId: string
  status: TransactionStatus
  reference?: string
}

export const financeAccounts: BankAccount[] = []
export const financeTransactions: FinancialTransaction[] = []
