export type CrmStatus = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
export type CrmPriority = 'Low' | 'Medium' | 'High'

export interface CrmContact {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  role?: string
}

export interface CrmLead {
  id: string
  contact: CrmContact
  source: string
  status: 'New' | 'Contacted' | 'Qualified' | 'Disqualified'
  createdAt: string
  notes?: string
}

export interface CrmDeal {
  id: string
  title: string
  contact: CrmContact
  value: number
  currency: string
  stage: CrmStatus
  priority: CrmPriority
  expectedCloseDate: string
  owner: string
}

export const crmInitialLeads: CrmLead[] = []
export const crmInitialDeals: CrmDeal[] = []

export const crmStages: { id: CrmStatus; label: string; color: string }[] = [
  { id: 'New', label: 'Nouveau', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'Contacted', label: 'Contacte', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'Qualified', label: 'Qualifie', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'Proposal', label: 'Proposition', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'Negotiation', label: 'Negociation', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'Won', label: 'Gagne', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'Lost', label: 'Perdu', color: 'bg-rose-50 text-rose-700 border-rose-200' },
]
