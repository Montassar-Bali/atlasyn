import { customers, inventory } from '../data'
import type {
  BusinessSystemSelection,
  CustomerSelection,
  InventorySelection,
} from './types'

export const businessSystems: readonly BusinessSystemSelection[] = [
  {
    id: 'revenue',
    label: 'Revenue',
    score: 91,
    factors: ['14.2% monthly growth', '87% forecast confidence'],
  },
  {
    id: 'customers',
    label: 'Customers',
    score: 76,
    factors: ['91.8% retention', '17 high-risk accounts'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    score: 88,
    factors: ['6.4x turnover', '3 critical SKUs'],
  },
  {
    id: 'cash-flow',
    label: 'Cash flow',
    score: 71,
    factors: ['4.2% over budget', 'Marketing spend elevated'],
  },
  {
    id: 'operations',
    label: 'Operations',
    score: 84,
    factors: ['Logistics costs rising', 'Direct sales above target'],
  },
]

const customerRecommendations: Record<string, string> = {
  'Carthage Distribution': 'Contact the account first; estimated recovery is 4,100 TND.',
  'Medina Retail Group': 'Schedule a retention review and inspect the order-frequency decline.',
  'Sahara Logistics': 'Offer a replenishment consultation before the next purchase window.',
}

export const customerSelections: readonly CustomerSelection[] = customers.map((customer) => ({
  name: customer.name,
  value: customer.value,
  lastPurchase: customer.last,
  risk: customer.risk,
  recommendation: customerRecommendations[customer.name]
    ?? 'Review recent activity and prepare a targeted retention action.',
}))

export const inventorySelections: readonly InventorySelection[] = inventory.map((item) => ({
  sku: item.sku,
  product: item.product,
  stock: item.stock,
  predictedDemand: item.demand,
  daysOfCover: item.days,
  status: item.status,
  reorderQuantity: item.reorder,
  critical: item.status === 'Critical',
}))
