export type CatalogItemType = 'Product' | 'Service'
export type CatalogItemStatus = 'Active' | 'Draft' | 'Archived'

export interface CatalogCategory {
  id: string
  name: string
  type: CatalogItemType
  color: string
}

export interface CatalogItem {
  id: string
  name: string
  sku: string
  type: CatalogItemType
  categoryId: string
  description?: string
  supplier?: string
  price: number
  wholesalePrice: number
  cost: number
  currency: string
  stock: number | null
  minStockLevel?: number
  status: CatalogItemStatus
  createdAt: string
  imageUrl?: string
}

export const catalogCategories: CatalogCategory[] = []
export const catalogInitialItems: CatalogItem[] = []
