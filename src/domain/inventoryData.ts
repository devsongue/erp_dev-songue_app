export type WarehouseStatus = 'Active' | 'Full' | 'Maintenance' | 'Closed'
export type MovementType = 'In' | 'Out' | 'Transfer'
export type MovementStatus = 'Completed' | 'Pending' | 'Cancelled'

export interface Warehouse {
  id: string
  name: string
  location: string
  capacity: number
  usedCapacity: number
  status: WarehouseStatus
  manager: string
}

export interface StockMovement {
  id: string
  date: string
  itemId: string
  itemName: string
  type: MovementType
  quantity: number
  sourceWarehouseId?: string
  destinationWarehouseId?: string
  status: MovementStatus
  reference: string
}

export const inventoryWarehouses: Warehouse[] = []
export const inventoryMovements: StockMovement[] = []
