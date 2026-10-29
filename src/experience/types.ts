import type { CSSProperties, MutableRefObject } from 'react'

export type BusinessSystemId = 'revenue' | 'customers' | 'inventory' | 'cash-flow' | 'operations'

export interface BusinessSystemSelection {
  id: BusinessSystemId
  label: string
  score: number
  factors: readonly string[]
}

export interface CustomerSelection {
  name: string
  value: string
  lastPurchase: string
  risk: number
  recommendation: string
}

export interface InventorySelection {
  sku: string
  product: string
  stock: number
  predictedDemand: number
  daysOfCover: number
  status: string
  reorderQuantity: number
  critical: boolean
}

export interface ExperienceCanvasProps {
  progressRef: MutableRefObject<number>
  active?: boolean
  className?: string
  style?: CSSProperties
  onSelectSystem?: (index: number, system: BusinessSystemSelection) => void
  onSelectCustomer?: (index: number, customer: CustomerSelection) => void
  onSelectInventory?: (index: number, item: InventorySelection) => void
}

export interface ExperienceSceneProps {
  onSelectSystem?: ExperienceCanvasProps['onSelectSystem']
  onSelectCustomer?: ExperienceCanvasProps['onSelectCustomer']
  onSelectInventory?: ExperienceCanvasProps['onSelectInventory']
}
