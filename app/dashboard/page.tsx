'use client'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from 'recharts'
import { RefreshCw, LogOut, Search, ChevronLeft, ChevronRight, Moon, Sun, Download, Save, Calendar, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Transaction, KPI } from '@/lib/types'

/* ─── 유틸 ─── */
const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined || isNaN(Number(n))) return '-'
  return Math.round(Number(n)).toLocaleString('ko-KR')
}
const fmtKRW = (n: number) => fmt(n) + '원'
const fmtRate = (n: number) => n.toFixed(2) + '%'

function calcKPI(rows: Transaction[]): KPI {
  const sales = rows.reduce((s, r) => s + (r.sales || 0), 0)
  const purchase = rows.reduce((s, r) => s + (r.purchase || 0), 0)
  const profit = rows.reduce((s, r) => s + (r.profit || 0), 0)
  return { sales, purchase, profit, profitRate: sales !== 0 ? (profit / sales) * 100 : 0, count: rows.length }
}

function calcChange(curr: number, prev: number) {
  if (prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

const WEEK_ORDER = ['1주차', '2주차', '3주차', '4주차', '5주차']
const PAGE_SIZE = 1000

/* ─── 멀티셀렉트 ─── */
function MultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: Set<string>; onChange: (s: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (v: string) => { const n = new Set(selected); n.has(v) ? n.delete(v) : n.add(v); onChange(n) }
  const allSelected = selected.size === options.length
  const noneSelected = selected.size === 0
  const text = noneSelected ? '전체' : selected.size === 1 ? [...selected][0] : `${[...selected][0]} 외 ${selected.size - 1}개`

  const handleToggleAll = () => {
    if (allSelected || (!noneSelected && !allSelected)) onChange(new Set())  // 전체 해제
    else onChange(new Set(options))  // 전체 선택
  }

  return (
    <div className="filter-item" ref={ref} style={{ position: 'relative', minWidth: 160 }}>
      <label>{label}</label>
      <button
        onClick={() => setOpen(o => !o)}
        className="multi-select-btn"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', height: 36, fontFamily: 'inherit', outline: 'none', gap: 6 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: 'var(--shadow)', maxHeight: 280, overflowY: 'auto', zIndex: 20, minWidth: 160 }}>
          {/* 전체 선택/해제 토글 */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={handleToggleAll}
              style={{ width: '100%', padding: '5px 0', fontSize: 12, fontWeight: 700, background: noneSelected ? 'var(--primary)' : 'var(--surface)', color: noneSelected ? 'white' : 'var(--text)', border: `1px solid ${noneSelected ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }}
            >{noneSelected ? '전체 선택' : '전체 해제'}</button>
          </div>
          {options.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, userSelect: 'none', color: 'var(--text)' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              <input type="checkbox" checked={selected.has(o)} onChange={() => toggle(o)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── 수정/추가 모달 ─── */
function getKoreanWeek(dateStr: string): string {
  const date = new Date(dateStr)
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7
  return Math.ceil((date.getDate() + firstDayOfWeek) / 7) + '주차'
}

interface EditModalProps {
  row: Partial<Transaction> | null   // null이면 새 항목 추가
  categories: string[]
  onSave: () => void
  onClose: () => void
}

function EditModal({ row, categories, onSave, onClose }: EditModalProps) {
  const isNew = !row?.id
  const [form, setForm] = useState({
    date:       row?.date       || new Date().toISOString().slice(0, 10),
    manager:    row?.manager    || '',
    company:    row?.company    || '',
    trade_name: row?.trade_name || '',
    category:   row?.category   || '접수형',
    sales:      row?.sales      ?? 0,
    purchase:   row?.purchase   ?? 0,
  })
  const [saving, setSaving] = useState(false)

  const profit = (Number(form.sales) || 0) - (Number(form.purchase) || 0)

  const handleSave = async () => {
    if (!form.date) return
    setSaving(true)
    const dateObj = new Date(form.date)
    const record = {
      date:       form.date,
      year:       dateObj.getFullYear(),
      month:      dateObj.getMonth() + 1,
      day:        dateObj.getDate(),
      week:       getKoreanWeek(form.date),
      manager:    form.manager.trim(),
      company:    form.company.trim(),
      trade_name: form.trade_name.trim(),
      category:   form.category.trim() || '(미분류)',
      sales:      Number(form.sales) || 0,
      purchase:   Number(form.purchase) || 0,
      profit,
      source:     'manual' as const,
    }
    if (isNew) {
      await supabase.from('transactions').insert(record)
    } else {
      await supabase.from('transactions').update(record).eq('id', row!.id!)
    }
    setSaving(false)
    onSave()
  }

  const fieldStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isNew ? '✏️ 거래 추가' : '✏️ 거래 수정'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>일자</label>
            <input type="date" style={fieldStyle} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>담당자</label>
            <input style={fieldStyle} value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} placeholder="담당자" />
          </div>
          <div>
            <label style={labelStyle}>구분</label>
            <input style={fieldStyle} list="cat-list" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="접수형, 관리형 등" />
            <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label style={labelStyle}>대행사명</label>
            <input style={fieldStyle} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="대행사명" />
          </div>
          <div>
            <label style={labelStyle}>상호명</label>
            <input style={fieldStyle} value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} placeholder="상호명" />
          </div>
          <div>
            <label style={labelStyle}>매출</label>
            <input type="number" style={fieldStyle} value={form.sales} onChange={e => setForm(f => ({ ...f, sales: +e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>매입</label>
            <input type="number" style={fieldStyle} value={form.purchase} onChange={e => setForm(f => ({ ...f, purchase: +e.target.value }))} />
          </div>
          <div style={{ gridColumn: '1/-1', background: 'var(--badge-bg)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>순익 (자동계산)</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: profit >= 0 ? 'var(--primary)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{profit.toLocaleString('ko-KR')}</span>
          </div>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

/* ─── 피벗 테이블 ─── */
function PivotTable({ rows }: { rows: Transaction[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, { items: Map<string, { sales: number; purchase: number; profit: number }>; total: number }>()
    rows.forEach(r => {
      if (!r.company) return
      const g = map.get(r.company) || { items: new Map(), total: 0 }
      const key = r.trade_name || r.company
      const item = g.items.get(key) || { sales: 0, purchase: 0, profit: 0 }
      item.sales += r.sales || 0; item.purchase += r.purchase || 0; item.profit += r.profit || 0
      g.items.set(key, item)
      g.total += r.profit || 0
      map.set(r.company, g)
    })
    return [...map.entries()]
      .map(([company, g]) => ({
        company, total: g.total,
        items: [...g.items.entries()].map(([tradeName, d]) => ({ tradeName, ...d })).sort((a, b) => b.profit - a.profit)
      }))
      .sort((a, b) => b.total - a.total)
  }, [rows])

  const maxAbs = useMemo(() => Math.max(...groups.flatMap(g => g.items.map(i => Math.abs(i.profit))), 1), [groups])

  if (!groups.length) return <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>데이터 없음</p>

  return (
    <div className="company-pivot-wrap">
      <table className="company-pivot">
        <thead>
          <tr>
            <th>업체명</th><th>상호명</th>
            <th className="num">매출</th><th className="num">매입</th><th className="num">순익</th>
            <th className="bar-col">적자 ← 분포 → 흑자</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ company, items, total }, gi) =>
            items.map((item, ii) => (
              <tr key={`${company}-${ii}`} className={`${ii === items.length - 1 ? 'group-end' : ''} ${gi % 2 === 1 ? 'group-alt' : ''}`}>
                {ii === 0 && (
                  <td className="company" rowSpan={items.length}>
                    <div className="company-name">{company}</div>
                    <div className="company-meta">
                      {items.length}건
                      <span className={`sum ${total >= 0 ? 'positive' : 'negative'}`}>{fmt(total)}</span>
                    </div>
                  </td>
                )}
                <td>{item.tradeName || '-'}</td>
                <td className="num positive">{fmt(item.sales)}</td>
                <td className="num negative">{fmt(item.purchase)}</td>
                <td className={`num ${item.profit >= 0 ? 'positive' : 'negative'}`}>{fmt(item.profit)}</td>
                <td>
                  <div className="bar-container">
                    {item.profit >= 0
                      ? <div className="bar-positive" style={{ width: `${(item.profit / maxAbs * 48).toFixed(2)}%` }} />
                      : <div className="bar-negative" style={{ width: `${(Math.abs(item.profit) / maxAbs * 48).toFixed(2)}%` }} />
                    }
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ─── 업체 모달 ─── */
type CompanyRow = { company: string; sales: number; purchase: number; profit: number; count: number }

function CompanyModal({ data, onClose }: { data: CompanyRow[]; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('profit_desc')
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const filtered = useMemo(() => {
    let rows = search ? data.filter(c => c.company.toLowerCase().includes(search.toLowerCase())) : [...data]
    return rows.sort((a, b) => {
      if (sort === 'profit_asc') return a.profit - b.profit
      if (sort === 'sales_desc') return b.sales - a.sales
      if (sort === 'count_desc') return b.count - a.count
      if (sort === 'name_asc') return a.company.localeCompare(b.company)
      return b.profit - a.profit
    })
  }, [data, search, sort])

  const sumSales = filtered.reduce((s, c) => s + c.sales, 0)
  const sumProfit = filtered.reduce((s, c) => s + c.profit, 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🏢 업체별 순익 전체 ({data.length}개)</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-controls">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 업체명 검색..." />
          <select value={sort} onChange={e => setSort(e.target.value)}>
            <option value="profit_desc">순익 높은 순</option>
            <option value="profit_asc">순익 낮은 순 (적자 먼저)</option>
            <option value="sales_desc">매출 높은 순</option>
            <option value="name_asc">업체명 가나다순</option>
            <option value="count_desc">거래 건수 많은 순</option>
          </select>
          <div className="modal-view-toggle">
            <button className={view === 'chart' ? 'active' : ''} onClick={() => setView('chart')}>📊 그래프</button>
            <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>📋 표</button>
          </div>
        </div>
        <div className="modal-summary">
          <span>총 <strong>{filtered.length}</strong>개</span>
          <span>매출 합계: <strong>{fmt(sumSales)}</strong></span>
          <span>순익 합계: <strong>{fmt(sumProfit)}</strong></span>
        </div>
        <div className="modal-body">
          {view === 'chart' ? (
            <div className="modal-chart-wrap" style={{ height: Math.max(400, filtered.length * 28 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filtered} layout="vertical" margin={{ left: 8, right: 70, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="company" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                  <Bar dataKey="profit" name="순익" radius={[0, 3, 3, 0]}>
                    {filtered.map((c, i) => <Cell key={i} fill={c.profit >= 0 ? '#7c3aed' : '#dc2626'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <table id="companyFullTable">
              <thead><tr><th>순위</th><th>업체명</th><th className="num">건수</th><th className="num">매출</th><th className="num">매입</th><th className="num">순익</th></tr></thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.company}>
                    <td>{i + 1}</td><td>{c.company}</td>
                    <td className="num">{c.count}</td>
                    <td className="num">{fmt(c.sales)}</td>
                    <td className="num">{fmt(c.purchase)}</td>
                    <td className={`num ${c.profit >= 0 ? 'positive' : 'negative'}`}>{fmt(c.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── 메인 ─── */
export default function DashboardPage() {
  const router = useRouter()
  const [currentRows, setCurrentRows] = useState<Transaction[]>([])  // DB 직접 조회 결과
  const [prevRows, setPrevRows] = useState<Transaction[]>([])         // 전월 비교용
  const [periods, setPeriods] = useState<{ year: number; month: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [dark, setDark] = useState(false)

  const [year, setYear] = useState(0)
  const [month, setMonth] = useState(0)
  const initializedRef = useRef(false)
  const [filterWeek, setFilterWeek] = useState('')
  const [filterDay, setFilterDay] = useState('')
  const [selCats, setSelCats] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCat, setBulkCat] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editRow, setEditRow] = useState<Partial<Transaction> | null>(null)  // null = 닫힘, {} = 새 항목, row = 수정

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  // 모든 필터 조건을 DB에 직접 전달해서 조회
  const fetchFilteredData = useCallback(async (
    y: number, m: number, week: string, day: string, cats: Set<string>, s: string
  ) => {
    setDataLoading(true)
    try {
      let q = supabase.from('transactions').select('*').order('date', { ascending: true })
      if (y > 0) q = q.eq('year', y)
      if (m > 0) q = q.eq('month', m)
      if (week) q = q.eq('week', week)
      if (day) q = q.eq('day', Number(day))
      if (cats.size > 0) q = q.in('category', [...cats])
      if (s.trim()) q = q.or(`company.ilike.%${s}%,trade_name.ilike.%${s}%,manager.ilike.%${s}%`)

      const { data } = await q
      setCurrentRows(data || [])

      // 전월 비교: 년+월 지정된 경우만 (다른 필터 없이 월 전체)
      if (y > 0 && m > 0) {
        const pm = m === 1 ? 12 : m - 1
        const py = m === 1 ? y - 1 : y
        const { data: prev } = await supabase.from('transactions')
          .select('*').eq('year', py).eq('month', pm)
        setPrevRows(prev || [])
      } else {
        setPrevRows([])
      }
    } finally {
      setDataLoading(false)
    }
  }, [])

  // 년월 목록 조회
  const fetchPeriods = useCallback(async () => {
    const { data, error } = await supabase.from('transaction_periods').select('year, month').order('year').order('month')
    if (error) { console.error('기간 목록 오류:', error.message); return }
    if (data && data.length > 0) {
      setPeriods(data)
      if (!initializedRef.current) {
        // 한국 시간(KST = UTC+9) 기준 당월로 초기화
        const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
        setYear(kstNow.getUTCFullYear())
        setMonth(kstNow.getUTCMonth() + 1)
        initializedRef.current = true
      }
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')
      fetchPeriods().finally(() => setLoading(false))
    })
  }, [router, fetchPeriods])

  // 검색 디바운스 (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // 필터 변경 시 DB 직접 조회 (초기화 후에만)
  useEffect(() => {
    if (!initializedRef.current) return
    fetchFilteredData(year, month, filterWeek, filterDay, selCats, debouncedSearch)
  }, [year, month, filterWeek, filterDay, selCats, debouncedSearch, fetchFilteredData])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }
  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([
      fetchPeriods(),
      fetchFilteredData(year, month, filterWeek, filterDay, selCats, debouncedSearch)
    ])
    setRefreshing(false)
  }

  /* ─ 드롭다운 고정 목록 ─ */
  const years = useMemo(() => [...new Set(periods.map(p => p.year))].sort((a, b) => a - b), [periods])
  const availableMonths = Array.from({ length: 12 }, (_, i) => i + 1)
  const weeks = WEEK_ORDER
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const FIXED_CATEGORIES = ['접수형', '관리형', '보장형', '테스트', '보장완료', '중단건']

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year

  const kpi = useMemo(() => calcKPI(currentRows), [currentRows])
  const prevKpi = useMemo(() => calcKPI(prevRows), [prevRows])

  const weeklyData = useMemo(() => WEEK_ORDER.map(w => {
    const r = currentRows.filter(t => t.week === w)
    if (!r.length) return null
    return { week: w, profit: r.reduce((s, t) => s + (t.profit || 0), 0) }
  }).filter(Boolean) as { week: string; profit: number }[], [currentRows])

  const dailyData = useMemo(() => {
    const map = new Map<string, { sales: number; purchase: number; profit: number }>()
    currentRows.forEach(t => {
      const e = map.get(t.date) || { sales: 0, purchase: 0, profit: 0 }
      map.set(t.date, { sales: e.sales + (t.sales || 0), purchase: e.purchase + (t.purchase || 0), profit: e.profit + (t.profit || 0) })
    })
    return [...map.entries()].sort().map(([date, d]) => ({ date: date.slice(5), ...d }))
  }, [currentRows])

  const companyData = useMemo(() => {
    const map = new Map<string, CompanyRow>()
    currentRows.forEach(t => {
      const k = t.company || '(미분류)'
      const e = map.get(k) || { company: k, sales: 0, purchase: 0, profit: 0, count: 0 }
      map.set(k, { ...e, sales: e.sales + (t.sales || 0), purchase: e.purchase + (t.purchase || 0), profit: e.profit + (t.profit || 0), count: e.count + 1 })
    })
    return [...map.values()].sort((a, b) => b.profit - a.profit)
  }, [currentRows])

  const categoryData = useMemo(() => {
    const map = new Map<string, { sales: number; purchase: number; profit: number; count: number }>()
    currentRows.forEach(t => {
      const k = t.category || '(미분류)'
      const e = map.get(k) || { sales: 0, purchase: 0, profit: 0, count: 0 }
      map.set(k, { sales: e.sales + (t.sales || 0), purchase: e.purchase + (t.purchase || 0), profit: e.profit + (t.profit || 0), count: e.count + 1 })
    })
    return [...map.entries()].map(([category, d]) => ({ category, ...d })).sort((a, b) => b.profit - a.profit)
  }, [currentRows])

  const lossData = useMemo(() => companyData.filter(c => c.profit < 0).slice(0, 5), [companyData])

  /* ─ 상세 테이블 ─ */
  const tableData = useMemo(() => {
    let rows = [...currentRows]
    Object.entries(colFilters).forEach(([col, val]) => {
      if (!val) return
      const q = val.toLowerCase()
      rows = rows.filter(r => String((r as unknown as Record<string, unknown>)[col] ?? '').toLowerCase().includes(q))
    })
    rows.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortCol]
      const vb = (b as unknown as Record<string, unknown>)[sortCol]
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [currentRows, colFilters, sortCol, sortDir])

  const totalPages = Math.ceil(tableData.length / PAGE_SIZE)
  const pagedData = tableData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const toggleId = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (checked: boolean) => setSelectedIds(checked ? new Set(pagedData.map(t => t.id)) : new Set())
  const allChecked = pagedData.length > 0 && pagedData.every(t => selectedIds.has(t.id))

  /* ─ 액션 ─ */
  const handleBulkUpdate = async () => {
    if (!selectedIds.size || !bulkCat.trim()) return
    if (!confirm(`${selectedIds.size}건을 '${bulkCat}'(으)로 변경하시겠습니까?`)) return
    const { error } = await supabase.from('transactions').update({ category: bulkCat.trim() }).in('id', [...selectedIds])
    if (error) { alert('변경 실패: ' + error.message); return }
    await fetchFilteredData(year, month, filterWeek, filterDay, selCats, debouncedSearch)
    setSelectedIds(new Set()); setBulkCat('')
  }

  // 시트 동기화: 구글 시트 읽어서 DB에 임시 저장 (is_closed=false)
  const handleSyncSheets = async () => {
    setSyncLoading(true)
    try {
      const res = await fetch('/api/sheets')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const rows: Transaction[] = json.transactions || []
      if (!rows.length) { alert('구글 시트에 데이터가 없습니다.'); return }

      const syncYear = rows[0].year
      const syncMonth = rows[0].month

      // 기존 임시 데이터 삭제 후 새 임시 데이터 저장
      await supabase.from('transactions')
        .delete().eq('year', syncYear).eq('month', syncMonth).eq('is_closed', false)

      const tempData = rows.map(t => ({ ...t, is_closed: false }))
      const BATCH = 100
      for (let i = 0; i < tempData.length; i += BATCH) {
        await supabase.from('transactions').insert(tempData.slice(i, i + BATCH))
      }

      await fetchPeriods()
      setYear(syncYear)
      setMonth(syncMonth)
      await fetchFilteredData(syncYear, syncMonth, '', '', new Set(), '')
      alert(`✅ ${syncYear}년 ${syncMonth}월 동기화 완료! (${rows.length}건 임시 저장)`)
    } catch (err) {
      alert('동기화 실패: ' + String(err))
    } finally {
      setSyncLoading(false)
    }
  }

  // 월 마감: 임시(is_closed=false) → 확정(is_closed=true)
  const handleCloseMonth = async () => {
    const tempCount = currentRows.filter(t => !t.is_closed).length
    if (tempCount === 0) { alert('마감할 임시 데이터가 없습니다.\n먼저 시트 동기화를 해주세요.'); return }
    if (!confirm(`${year}년 ${month}월 데이터 ${tempCount}건을 마감 처리합니다.\n마감 후에는 확정 데이터로 저장됩니다.\n계속하시겠습니까?`)) return

    const { error } = await supabase.from('transactions')
      .update({ is_closed: true, closed_at: new Date().toISOString() })
      .eq('year', year).eq('month', month).eq('is_closed', false)

    if (error) { alert('마감 실패: ' + error.message); return }
    await fetchFilteredData(year, month, filterWeek, filterDay, selCats, debouncedSearch)
    alert(`✅ ${year}년 ${month}월 마감 완료!`)
  }

  const handleSnapshot = async () => {
    if (!confirm('현재 보고서를 저장하시겠습니까?')) return
    const { error } = await supabase.from('snapshots').insert({ year, month, filters: { week: filterWeek, day: filterDay, categories: [...selCats], search }, summary: { sales: kpi.sales, purchase: kpi.purchase, profit: kpi.profit, profitRate: kpi.profitRate, count: kpi.count } })
    if (error) { alert('저장 실패: ' + error.message); return }
    alert('✅ 보고서가 저장되었습니다.')
  }

  const handlePDF = async () => {
    const el = document.getElementById('dashboard')
    if (!el) return
    const { default: html2canvas } = await import('html2canvas')
    const { default: jsPDF } = await import('jspdf')
    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true })
    const pdf = new jsPDF('landscape', 'mm', 'a4')
    const w = pdf.internal.pageSize.getWidth()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, w, (canvas.height * w) / canvas.width)
    pdf.save(`일류_손익보고서_${year}-${String(month).padStart(2, '0')}.pdf`)
  }

  const resetFilters = () => { setFilterWeek(''); setFilterDay(''); setSelCats(new Set()); setSearch(''); setColFilters({}); setPage(1) }

  /* ─ 전월 비교 표시 ─ */
  const hasPrev = prevRows.length > 0
  function showChange(curr: number, prev: number, betterIsUp: boolean) {
    if (!hasPrev) return ''
    const diff = curr - prev
    if (diff === 0) return '─ 전월 동일'
    const isUp = diff > 0
    const arrow = isUp ? '▲' : '▼'
    const pct = prev !== 0 ? Math.abs(((curr - prev) / Math.abs(prev)) * 100) : 100
    const pctStr = pct > 999 ? '999%+' : pct.toFixed(1) + '%'
    const good = isUp === betterIsUp
    return <span className={good ? 'kpi-change up' : 'kpi-change down'}>{arrow} {pctStr} vs {prevYear}년 {prevMonth}월</span>
  }

  if (loading) return (
    <div className="full-screen">
      <div className="loader-content">
        <div className="spinner" />
        <p>데이터 불러오는 중...</p>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        :root {
          --bg:#f5f7fa;--surface:#fff;--border:#e5e7eb;--text:#111827;--text-muted:#6b7280;
          --primary:#7c3aed;--primary-dark:#6d28d9;--accent:#a855f7;--success:#16a34a;
          --danger:#dc2626;--warning:#f59e0b;--shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
          --radius:10px;--hover-bg:#f9fafb;--header-bg:#f9fafb;--table-alt:#faf5ff;
          --company-bg:#f3e8ff;--company-text:#6d28d9;--company-meta:#7c3aed;
          --badge-bg:#f3e8ff;--bar-bg:#f9fafb;--bar-line:#d1d5db;
        }
        [data-theme="dark"] {
          --bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f1f5f9;--text-muted:#94a3b8;
          --primary:#a855f7;--primary-dark:#c084fc;--accent:#c084fc;--success:#22c55e;
          --danger:#ef4444;--warning:#fbbf24;--shadow:0 4px 12px rgba(0,0,0,.4);
          --hover-bg:#334155;--header-bg:#0f172a;--table-alt:#1e1b4b;
          --company-bg:#4c1d95;--company-text:#ddd6fe;--company-meta:#c4b5fd;
          --badge-bg:#4c1d95;--bar-bg:#0f172a;--bar-line:#475569;
        }
        *{box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;background:var(--bg);color:var(--text);margin:0;padding:0;font-size:14px;line-height:1.5}
        .full-screen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);color:white;z-index:9999}
        .loader-content{text-align:center}
        .spinner{width:48px;height:48px;border:4px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 20px}
        @keyframes spin{to{transform:rotate(360deg)}}
        .app{max-width:1400px;margin:0 auto;padding:24px}
        .app-header{display:flex;justify-content:space-between;align-items:center;background:var(--surface);padding:20px 24px;border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px;flex-wrap:wrap;gap:12px}
        .app-header h1{margin:0;font-size:22px;font-weight:700}
        .subtitle{margin:4px 0 0;color:var(--text-muted);font-size:13px}
        .header-right{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .theme-toggle{width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text);padding:0}
        .theme-toggle:hover{background:var(--hover-bg)}
        .user-badge{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--badge-bg);border-radius:20px;font-size:13px;color:var(--primary);font-weight:600}
        .btn-logout{background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:2px 8px;border-left:1px solid var(--border);margin-left:4px}
        .btn-logout:hover{color:var(--danger)}
        .data-status{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:var(--badge-bg);color:var(--primary);border-radius:12px;font-size:11px;font-weight:600}
        .filter-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;background:var(--surface);padding:16px 20px;border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px}
        .filter-item{display:flex;flex-direction:column;min-width:100px}
        .filter-item.search{min-width:240px;flex:1;max-width:360px}
        .filter-item label{font-size:12px;color:var(--text-muted);margin-bottom:4px;font-weight:500;white-space:nowrap;height:18px;line-height:18px}
        .filter-item select,.filter-item input[type="text"]{padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;outline:none;font-family:inherit;height:36px}
        .filter-item select:focus,.filter-item input[type="text"]:focus{border-color:var(--primary)}
        .filter-actions{display:flex;gap:8px;margin-left:auto;align-items:flex-end}
        .btn{padding:9px 16px;border-radius:6px;border:1px solid transparent;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;height:36px}
        .btn-primary{background:var(--primary);color:white}
        .btn-primary:hover{background:var(--primary-dark)}
        .btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border)}
        .btn-secondary:hover{background:var(--hover-bg)}
        .btn-ghost{background:transparent;color:var(--text-muted)}
        .btn-ghost:hover{background:var(--hover-bg)}
        .btn-sm{padding:5px 12px;font-size:12px;height:30px}
        .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
        .kpi-card{background:var(--surface);padding:20px;border-radius:var(--radius);box-shadow:var(--shadow);border-left:4px solid var(--primary)}
        .kpi-card:nth-child(2){border-left-color:var(--warning)}
        .kpi-card:nth-child(3){border-left-color:var(--accent)}
        .kpi-card:nth-child(4){border-left-color:var(--success)}
        .kpi-label{font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:500}
        .kpi-value{font-size:26px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums}
        .kpi-value.negative{color:var(--danger)}
        .kpi-change{font-size:12px;margin-top:8px;font-weight:600;min-height:18px}
        .kpi-change.up{color:var(--success)}
        .kpi-change.down{color:var(--danger)}
        .kpi-change.neutral{color:var(--text-muted);font-weight:400}
        .card{background:var(--surface);padding:20px;border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px}
        .card h3{margin:0 0 16px;font-size:15px;font-weight:600}
        .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}
        .card-header h3{margin:0}
        .badge{display:inline-block;padding:4px 10px;background:var(--badge-bg);color:var(--primary);border-radius:12px;font-size:12px;font-weight:600}
        .chart-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .chart-card{margin-bottom:20px}
        .chart-wrap{height:320px;position:relative}
        .table-wrap{overflow-x:auto;max-height:400px;overflow-y:auto}
        .detail-wrap{max-height:600px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        thead{position:sticky;top:0;background:var(--header-bg);z-index:2}
        th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        th{font-weight:600;color:var(--text-muted);font-size:12px;letter-spacing:.3px}
        td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
        tr:hover td{background:var(--hover-bg)}
        td.negative{color:var(--danger);font-weight:600}
        td.positive{color:var(--success)}
        .company-pivot-wrap{overflow-x:auto;max-height:600px;overflow-y:auto}
        .company-pivot{width:100%;border-collapse:collapse;font-size:13px}
        .company-pivot th{background:var(--header-bg);font-weight:600;color:var(--text-muted);font-size:12px;padding:10px 12px;border-bottom:1px solid var(--border);text-align:left;position:sticky;top:0;z-index:1;white-space:nowrap}
        .company-pivot th.num{text-align:right}
        .company-pivot th.bar-col{text-align:center;width:45%}
        .company-pivot td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
        .company-pivot td.company{background:var(--company-bg);font-weight:600;border-right:2px solid var(--border);text-align:center;color:var(--company-text);padding:12px 10px;min-width:110px}
        .company-pivot td.company .company-name{font-size:14px;font-weight:700;margin-bottom:6px}
        .company-pivot td.company .company-meta{font-size:11px;color:var(--company-meta);font-weight:500;line-height:1.5}
        .company-pivot td.company .company-meta .sum{display:block;margin-top:2px;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
        .company-pivot td.company .company-meta .sum.positive{color:var(--primary)}
        .company-pivot td.company .company-meta .sum.negative{color:var(--danger)}
        .company-pivot td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
        .company-pivot td.num.positive{color:var(--primary)}
        .company-pivot td.num.negative{color:var(--danger)}
        .company-pivot tr.group-end td:not(.company){border-bottom:2px solid var(--text-muted)}
        .company-pivot tr.group-alt td:not(.company){background:var(--table-alt)}
        .bar-container{position:relative;height:20px;background:var(--bar-bg);border-radius:3px}
        .bar-container::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--bar-line)}
        .bar-positive{position:absolute;left:50%;top:2px;bottom:2px;background:var(--primary);border-radius:0 3px 3px 0}
        .bar-negative{position:absolute;right:50%;top:2px;bottom:2px;background:var(--danger);border-radius:3px 0 0 3px}
        .sort-icon{display:inline-block;margin-left:4px;font-size:10px;color:var(--text-muted);opacity:.4}
        .sort-active{color:var(--primary);opacity:1}
        .th-flex{display:flex;flex-direction:column;gap:4px}
        .col-filter{padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font-size:11px;outline:none;font-family:inherit;width:100%}
        .col-filter:focus{border-color:var(--primary)}
        .col-filter.active{border-color:var(--primary);background:var(--badge-bg)}
        .detail-summary{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .detail-kpi{font-size:12px;color:var(--text-muted);white-space:nowrap}
        .detail-kpi strong{color:var(--text);font-weight:700;margin-left:4px;font-variant-numeric:tabular-nums}
        .detail-kpi strong.negative{color:var(--danger)}
        .detail-kpi.sales strong{color:var(--warning)}
        .detail-kpi.profit strong{color:var(--success)}
        .bulk-controls{display:flex;align-items:center;gap:16px;padding:14px 18px;background:linear-gradient(135deg,var(--badge-bg) 0%,transparent 100%);border:2px solid var(--primary);border-radius:10px;margin-bottom:14px;flex-wrap:wrap}
        .bulk-count{color:var(--primary);font-weight:600;font-size:14px}
        .bulk-count strong{font-size:18px;margin:0 4px}
        .bulk-actions{display:flex;gap:8px;flex-wrap:wrap;flex:1;align-items:center}
        .bulk-input{padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;min-width:220px;flex:1;max-width:320px;height:36px;font-family:inherit;outline:none}
        .bulk-input:focus{border-color:var(--primary)}
        .check-col{width:40px;text-align:center!important}
        .row-check{cursor:pointer;width:16px;height:16px}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
        .modal-content{background:var(--surface);color:var(--text);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:100%;max-width:900px;max-height:90vh;display:flex;flex-direction:column}
        .modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)}
        .modal-header h3{margin:0;font-size:16px}
        .modal-close{background:transparent;border:none;cursor:pointer;font-size:28px;color:var(--text-muted);line-height:1;padding:0 4px}
        .modal-close:hover{color:var(--danger)}
        .modal-controls{display:flex;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);flex-wrap:wrap;align-items:center}
        .modal-controls input,.modal-controls select{padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;outline:none;font-family:inherit;height:36px}
        .modal-controls input{flex:1;min-width:200px}
        .modal-body{flex:1;overflow-y:auto}
        .modal-summary{padding:10px 20px;background:var(--header-bg);border-bottom:1px solid var(--border);display:flex;gap:16px;flex-wrap:wrap;font-size:12px}
        .modal-summary span strong{color:var(--text);margin-left:4px}
        .modal-view-toggle{display:flex;gap:2px;background:var(--header-bg);border-radius:6px;padding:2px;height:36px}
        .modal-view-toggle button{padding:0 12px;border:none;background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;border-radius:4px;cursor:pointer;font-family:inherit;transition:all .15s}
        .modal-view-toggle button.active{background:var(--surface);color:var(--primary);box-shadow:0 1px 2px rgba(0,0,0,.1)}
        .modal-chart-wrap{padding:20px;min-height:400px;position:relative}
        .hidden{display:none!important}
        .toast{position:fixed;bottom:24px;right:24px;background:var(--text);color:var(--bg);padding:12px 20px;border-radius:8px;z-index:1001;box-shadow:0 10px 30px rgba(0,0,0,.15)}
        .toast.success{background:var(--success);color:white}
        @media(max-width:980px){.kpi-row{grid-template-columns:repeat(2,1fr)}.chart-row{grid-template-columns:1fr}}
      `}</style>

      <div className="app">
        {/* Header */}
        <header className="app-header">
          <div>
            <h1>📊 일류 손익 보고 대시보드</h1>
            <p className="subtitle">
              일류기획 | 주차별 손익 현황&nbsp;
              {currentRows.some(t => !t.is_closed)
                ? <span className="data-status" style={{ background: '#fef3c7', color: '#b45309' }}>📝 임시저장 {currentRows.length.toLocaleString()}건</span>
                : <span className="data-status">⚡ {currentRows.length.toLocaleString()}건 로드됨</span>
              }
            </p>
          </div>
          <div className="header-right">
            <button className="theme-toggle" onClick={() => setDark(d => !d)} title="다크/라이트 모드">
              {dark ? '☀️' : '🌙'}
            </button>
            <span className="user-badge">
              <span>{userEmail.split('@')[0]}</span>
              <button className="btn-logout" onClick={handleLogout}>로그아웃</button>
            </span>
            <button className="btn btn-primary" onClick={handleSyncSheets} disabled={syncLoading}>
              {syncLoading ? '⏳ 동기화 중...' : '🔄 시트 동기화'}
            </button>
            <button className="btn btn-secondary" onClick={handleSnapshot}>💾 보고서 저장</button>
            <button className="btn btn-secondary" onClick={handleCloseMonth} disabled={syncLoading}>🗓️ 이번 달 마감</button>
            <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? '⏳ 불러오는 중...' : '🔄 새로고침'}
            </button>
            <button className="btn btn-secondary" onClick={handlePDF}>📄 PDF 다운로드</button>
          </div>
        </header>

        {/* Filter Bar */}
        <section className="filter-bar">
          <div className="filter-item">
            <label>년도</label>
            <select value={year || ''} onChange={e => { setYear(+e.target.value); setMonth(0); setFilterWeek(''); setFilterDay(''); setPage(1) }}>
              {!initializedRef.current && <option value="">로딩 중...</option>}
              <option value={0}>전체</option>
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label>월</label>
            <select value={month} onChange={e => { setMonth(+e.target.value); setFilterWeek(''); setFilterDay(''); setPage(1) }}>
              <option value={0}>전체</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label>주차</label>
            <select value={filterWeek} onChange={e => { setFilterWeek(e.target.value); setFilterDay(''); setPage(1) }}>
              <option value="">전체</option>
              {weeks.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label>일</label>
            <select value={filterDay} onChange={e => { setFilterDay(e.target.value); setPage(1) }}>
              <option value="">전체</option>
              {days.map(d => <option key={d} value={d}>{d}일</option>)}
            </select>
          </div>
          <MultiSelect label="구분 (다중 선택)" options={FIXED_CATEGORIES} selected={selCats} onChange={s => { setSelCats(s); setPage(1) }} />
          <div className="filter-item search">
            <label>🔍 검색</label>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="업체명/상호명 (부분 검색)" />
          </div>
          <div className="filter-actions">
            <button className="btn btn-primary" onClick={() => setPage(1)}>조회</button>
            <button className="btn btn-ghost" onClick={resetFilters}>초기화</button>
          </div>
        </section>

        <main id="dashboard">
          {/* KPI */}
          <section className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">매출 합계</div>
              <div className="kpi-value">{fmt(kpi.sales)}</div>
              <div className="kpi-change">{showChange(kpi.sales, prevKpi.sales, true)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">매입 합계</div>
              <div className="kpi-value">{fmt(kpi.purchase)}</div>
              <div className="kpi-change">{showChange(kpi.purchase, prevKpi.purchase, false)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">순익 합계</div>
              <div className={`kpi-value ${kpi.profit < 0 ? 'negative' : ''}`}>{fmt(kpi.profit)}</div>
              <div className="kpi-change">{showChange(kpi.profit, prevKpi.profit, true)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">손익률</div>
              <div className={`kpi-value ${kpi.profitRate < 0 ? 'negative' : ''}`}>{fmtRate(kpi.profitRate)}</div>
              <div className="kpi-change">{hasPrev ? <span className={kpi.profitRate > prevKpi.profitRate ? 'kpi-change up' : 'kpi-change down'}>{kpi.profitRate > prevKpi.profitRate ? '▲' : '▼'} {Math.abs(kpi.profitRate - prevKpi.profitRate).toFixed(2)}%p vs {prevYear}년 {prevMonth}월</span> : ''}</div>
            </div>
          </section>

          {/* 주차별 순익 */}
          <section className="card">
            <h3>주차별 순익</h3>
            <div className="chart-wrap">
              {weeklyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                    <Bar dataKey="profit" name="순익" radius={[4, 4, 0, 0]}>
                      {weeklyData.map((entry, i) => <Cell key={i} fill={entry.profit >= 0 ? '#7c3aed' : '#dc2626'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 60 }}>데이터 없음</p>}
            </div>
          </section>

          {/* 업체별 + 일자별 */}
          <section className="chart-row">
            <div className="card chart-card">
              <div className="card-header">
                <h3>업체별 순익 (상위 15개)</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(true)}>📋 전체 보기</button>
              </div>
              <div className="chart-wrap">
                {companyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={companyData.slice(0, 15)} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="company" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                      <Bar dataKey="profit" name="순익" radius={[0, 3, 3, 0]}>
                        {companyData.slice(0, 15).map((c, i) => <Cell key={i} fill={c.profit >= 0 ? '#7c3aed' : '#dc2626'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 60 }}>데이터 없음</p>}
              </div>
            </div>
            <div className="card chart-card">
              <h3>일자별 손익 추이</h3>
              <div className="chart-wrap">
                {dailyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="sales" name="매출" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="purchase" name="매입" stroke="#a855f7" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="profit" name="순익" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 60 }}>데이터 없음</p>}
              </div>
            </div>
          </section>

          {/* 구분별 + 적자 TOP 5 */}
          <section className="chart-row">
            <div className="card">
              <h3>구분별 손익 요약</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>구분</th><th className="num">건수</th><th className="num">매출</th><th className="num">매입</th><th className="num">순익</th></tr></thead>
                  <tbody>
                    {categoryData.map(r => (
                      <tr key={r.category}>
                        <td>{r.category}</td>
                        <td className="num">{fmt(r.count)}</td>
                        <td className="num">{fmt(r.sales)}</td>
                        <td className="num">{fmt(r.purchase)}</td>
                        <td className={`num ${r.profit < 0 ? 'negative' : 'positive'}`}>{fmt(r.profit)}</td>
                      </tr>
                    ))}
                    {!categoryData.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>데이터 없음</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <h3>적자 업체 TOP 5</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>순위</th><th>업체명</th><th className="num">순익</th></tr></thead>
                  <tbody>
                    {lossData.map((r, i) => (
                      <tr key={r.company}>
                        <td>{i + 1}</td>
                        <td>{r.company}</td>
                        <td className="num negative">{fmt(r.profit)}</td>
                      </tr>
                    ))}
                    {!lossData.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>적자 업체 없음 🎉</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 피벗 테이블 */}
          <section className="card">
            <h3>업체별 상호명 순익 분포 <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>(대행사명 + 상호명 기준)</span></h3>
            <PivotTable rows={currentRows} />
          </section>

          {/* 상세 거래 리스트 */}
          <section className="card">
            <div className="card-header">
              <h3>상세 거래 리스트</h3>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setEditRow({ year, month: month || new Date().getMonth() + 1 })}
                style={{ marginLeft: 'auto', marginRight: 12 }}
              >+ 거래 추가</button>
              <div className="detail-summary">
                <span className="badge" id="detailCount">{tableData.length}건</span>
                <span className="detail-kpi sales">💰 매출:<strong>{fmt(tableData.reduce((s, t) => s + (t.sales || 0), 0))}</strong></span>
                <span className="detail-kpi">💸 매입:<strong>{fmt(tableData.reduce((s, t) => s + (t.purchase || 0), 0))}</strong></span>
                <span className="detail-kpi profit">📈 순익:<strong className={tableData.reduce((s, t) => s + (t.profit || 0), 0) < 0 ? 'negative' : ''}>{fmt(tableData.reduce((s, t) => s + (t.profit || 0), 0))}</strong></span>
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="bulk-controls">
                <div><span className="bulk-count">📌<strong>{selectedIds.size}</strong>건 선택됨</span></div>
                <div className="bulk-actions">
                  <input className="bulk-input" type="text" value={bulkCat} onChange={e => setBulkCat(e.target.value)} placeholder="새 카테고리 (예: 보장 완료, 중단건)" onKeyDown={e => e.key === 'Enter' && handleBulkUpdate()} />
                  <button className="btn btn-primary btn-sm" onClick={handleBulkUpdate}>✓ 변경 적용</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>선택 해제</button>
                </div>
              </div>
            )}

            <div className="table-wrap detail-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="check-col">
                      <input type="checkbox" className="row-check" checked={allChecked} onChange={e => toggleAll(e.target.checked)} />
                    </th>
                    {[
                      { key: 'date', label: '일자' }, { key: 'week', label: '주차' },
                      { key: 'category', label: '구분' }, { key: 'company', label: '업체명' },
                      { key: 'trade_name', label: '상호명' }, { key: 'sales', label: '매출', num: true },
                      { key: 'purchase', label: '매입', num: true }, { key: 'profit', label: '순익', num: true },
                    ].map(({ key, label, num }) => (
                      <th key={key} className={num ? 'num' : ''} style={{ cursor: 'pointer' }} onClick={() => handleSort(key)}>
                        <div className="th-flex">
                          <span>
                            {label}
                            <span className={`sort-icon ${sortCol === key ? 'sort-active' : ''}`}>
                              {sortCol === key ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
                            </span>
                          </span>
                          <input
                            type="text"
                            className={`col-filter ${colFilters[key] ? 'active' : ''}`}
                            value={colFilters[key] || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { setColFilters(p => ({ ...p, [key]: e.target.value })); setPage(1) }}
                            placeholder="🔍"
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedData.map(t => (
                    <tr key={t.id} style={{ background: selectedIds.has(t.id) ? 'var(--badge-bg)' : undefined, cursor: 'pointer' }}
                      onClick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') setEditRow(t) }}>
                      <td className="check-col" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="row-check" checked={selectedIds.has(t.id)} onChange={() => toggleId(t.id)} />
                      </td>
                      <td>{t.date}</td>
                      <td>{t.week}</td>
                      <td>{t.category}</td>
                      <td>{t.company || '-'}</td>
                      <td>{t.trade_name || '-'}</td>
                      <td className="num">{fmt(t.sales)}</td>
                      <td className="num">{fmt(t.purchase)}</td>
                      <td className={`num ${(t.profit || 0) < 0 ? 'negative' : ''}`}>{fmt(t.profit)}</td>
                    </tr>
                  ))}
                  {!pagedData.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>데이터가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tableData.length)} / {tableData.length}건</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                  <span style={{ fontSize: 13, padding: '0 8px' }}>{page} / {totalPages}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      {showModal && <CompanyModal data={companyData} onClose={() => setShowModal(false)} />}
      {editRow !== null && (
        <EditModal
          row={editRow}
          categories={FIXED_CATEGORIES}
          onSave={async () => { setEditRow(null); await fetchFilteredData(year, month, filterWeek, filterDay, selCats, debouncedSearch) }}
          onClose={() => setEditRow(null)}
        />
      )}
    </>
  )
}
