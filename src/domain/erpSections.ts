import type { LucideIcon } from 'lucide-react'
import {
  BadgeDollarSign,
  Boxes,
  Calculator,
  Contact,
  FileCheck2,
  HandCoins,
  Package,
  ReceiptText,
  ShoppingCart,
  Users,
} from 'lucide-react'

export type ErpSectionKey =
  | 'sales'
  | 'pos'
  | 'inventory'
  | 'finance'
  | 'accounting'
  | 'quotes'
  | 'invoices'
  | 'hr'
  | 'products-services'
  | 'crm'

export type ErpSection = {
  key: ErpSectionKey
  title: string
  eyebrow: string
  description: string
  icon: LucideIcon
  actions: string[]
  metrics: Array<{ label: string; value: string }>
  records: Array<Record<string, string>>
}

export const erpSections: Record<ErpSectionKey, ErpSection> = {
  sales: {
    key: 'sales',
    title: 'Ventes',
    eyebrow: 'Ventes',
    description: 'Commandes, ventes et suivi commercial.',
    icon: BadgeDollarSign,
    actions: [],
    metrics: [],
    records: [],
  },
  pos: {
    key: 'pos',
    title: 'Caisse',
    eyebrow: 'Point de vente',
    description: 'Caisse, tickets, paiements et retours.',
    icon: ShoppingCart,
    actions: [],
    metrics: [],
    records: [],
  },
  inventory: {
    key: 'inventory',
    title: 'Stock',
    eyebrow: 'Stock',
    description: 'Articles, niveaux de stock et mouvements.',
    icon: Boxes,
    actions: [],
    metrics: [],
    records: [],
  },
  finance: {
    key: 'finance',
    title: 'Argent',
    eyebrow: 'Finance',
    description: 'Encaissements, dépenses et trésorerie.',
    icon: HandCoins,
    actions: [],
    metrics: [],
    records: [],
  },
  accounting: {
    key: 'accounting',
    title: 'Comptabilité',
    eyebrow: 'Compta',
    description: 'Journaux, écritures et exports comptables.',
    icon: Calculator,
    actions: [],
    metrics: [],
    records: [],
  },
  quotes: {
    key: 'quotes',
    title: 'Devis',
    eyebrow: 'Devis',
    description: 'Création et suivi des devis.',
    icon: FileCheck2,
    actions: [],
    metrics: [],
    records: [],
  },
  invoices: {
    key: 'invoices',
    title: 'Factures',
    eyebrow: 'Facturation',
    description: 'Factures, paiements et relances.',
    icon: ReceiptText,
    actions: [],
    metrics: [],
    records: [],
  },
  hr: {
    key: 'hr',
    title: 'Équipe',
    eyebrow: 'Équipe',
    description: 'Collaborateurs et accès.',
    icon: Users,
    actions: [],
    metrics: [],
    records: [],
  },
  'products-services': {
    key: 'products-services',
    title: 'Produits et services',
    eyebrow: 'Catalogue',
    description: 'Produits, services, prix et disponibilité.',
    icon: Package,
    actions: [],
    metrics: [],
    records: [],
  },
  crm: {
    key: 'crm',
    title: 'Clients',
    eyebrow: 'Clients',
    description: 'Clients, contacts et suivi commercial.',
    icon: Contact,
    actions: [],
    metrics: [],
    records: [],
  },
}
