export interface Transaction {
  id: string
  date: string
  year: number
  month: number
  day: number
  week: string
  category: string
  manager: string
  company: string
  trade_name: string
  sales: number
  purchase: number
  profit: number
  source: string
  is_closed: boolean
  closed_at: string | null
  created_at: string
}

export interface KPI {
  sales: number
  purchase: number
  profit: number
  profitRate: number
  count: number
}
