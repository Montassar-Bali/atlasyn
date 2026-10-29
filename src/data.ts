export const revenueData = [
  { month: 'Apr', actual: 94, forecast: null },
  { month: 'May', actual: 101, forecast: null },
  { month: 'Jun', actual: 112, forecast: null },
  { month: 'Jul', actual: 108, forecast: null },
  { month: 'Aug', actual: 124, forecast: null },
  { month: 'Sep', actual: 142.5, forecast: 142.5 },
  { month: 'Oct', actual: null, forecast: 155.9 },
  { month: 'Nov', actual: null, forecast: 162.4 },
  { month: 'Dec', actual: null, forecast: 171.2 },
]

export const weeklyRevenue = [
  { day: 'Mon', revenue: 18.2, target: 17.4 },
  { day: 'Tue', revenue: 20.8, target: 18.1 },
  { day: 'Wed', revenue: 17.6, target: 18.8 },
  { day: 'Thu', revenue: 24.1, target: 19.4 },
  { day: 'Fri', revenue: 27.3, target: 20.2 },
  { day: 'Sat', revenue: 21.1, target: 16.8 },
  { day: 'Sun', revenue: 13.4, target: 12.6 },
]

export const segmentData = [
  { name: 'Enterprise', value: 48, color: '#17243A' },
  { name: 'Mid-market', value: 32, color: '#2F6F6D' },
  { name: 'Small business', value: 20, color: '#C4A66A' },
]

export const customers = [
  { name: 'Carthage Distribution', initials: 'CD', value: '12,840 TND', last: '48 days ago', risk: 91 },
  { name: 'Medina Retail Group', initials: 'MR', value: '9,620 TND', last: '39 days ago', risk: 84 },
  { name: 'Sahara Logistics', initials: 'SL', value: '7,410 TND', last: '31 days ago', risk: 76 },
  { name: 'North Coast Market', initials: 'NC', value: '6,380 TND', last: '28 days ago', risk: 69 },
  { name: 'Olive & Co.', initials: 'OC', value: '4,950 TND', last: '24 days ago', risk: 61 },
]

export const inventory = [
  { product: 'Smart POS Terminal', sku: 'POS-204', stock: 184, demand: 510, days: 11, reorder: 350, status: 'Critical' },
  { product: 'Barcode Scanner Pro', sku: 'SCN-118', stock: 92, demand: 176, days: 16, reorder: 110, status: 'Low' },
  { product: 'Receipt Printer Mini', sku: 'PRN-032', stock: 248, demand: 212, days: 35, reorder: 0, status: 'Healthy' },
  { product: 'Cash Drawer S2', sku: 'CDR-091', stock: 71, demand: 84, days: 25, reorder: 35, status: 'Watch' },
  { product: 'Inventory Tablet 10', sku: 'TAB-510', stock: 134, demand: 106, days: 38, reorder: 0, status: 'Healthy' },
]

export const products = [
  { name: 'Smart POS Terminal', revenue: 42.8, growth: 27.4, margin: 38 },
  { name: 'Inventory Tablet 10', revenue: 31.2, growth: 18.1, margin: 34 },
  { name: 'Receipt Printer Mini', revenue: 26.5, growth: 8.6, margin: 42 },
  { name: 'Barcode Scanner Pro', revenue: 22.1, growth: -3.2, margin: 31 },
  { name: 'Cash Drawer S2', revenue: 19.9, growth: 4.7, margin: 29 },
]

export const expenses = [
  { name: 'Operations', current: 21.4, previous: 19.8 },
  { name: 'Marketing', current: 17.7, previous: 13.5 },
  { name: 'Logistics', current: 12.2, previous: 10.1 },
  { name: 'Payroll', current: 38.6, previous: 37.9 },
  { name: 'Software', current: 8.4, previous: 8.1 },
]

export const anomalies = [
  { title: 'Marketing spend spike', detail: 'Meta Campaign X is 31% above its 30-day baseline.', time: '18 min ago', severity: 'high' },
  { title: 'Unusual invoice amount', detail: 'INV-20491 is 2.4× higher than this supplier average.', time: '2 hrs ago', severity: 'medium' },
  { title: 'Inventory velocity shift', detail: 'POS-204 demand accelerated 19% over the last 7 days.', time: 'Yesterday', severity: 'low' },
]

export const channelData = [
  { channel: 'Direct sales', revenue: 58.2, growth: 16.2 },
  { channel: 'E-commerce', revenue: 38.7, growth: 22.8 },
  { channel: 'Partners', revenue: 27.4, growth: 6.4 },
  { channel: 'Marketplace', revenue: 18.2, growth: -2.1 },
]
