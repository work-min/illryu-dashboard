'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, Cell
} from 'recharts'

interface Employee { name: string; net: number; note: string }
interface Expenses { fixed: number; variable: number; total: number }

const CSS = `
  :root{--bg:#f8f7ff;--surface:#fff;--border:#e8e4f3;--text:#1a1523;--text-muted:#6b7280;--primary:#7c3aed;--hover-bg:#f3f0ff;--danger:#dc2626;--success:#16a34a}
  .dark{--bg:#0f0d1a;--surface:#1a1727;--border:#2d2640;--text:#f0eeff;--text-muted:#9ca3af;--hover-bg:#252035}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'Pretendard','Apple SD Gothic Neo',sans-serif}
  .wrap{min-height:100vh;background:var(--bg)}
  .app-header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
  .header-logo{display:flex;flex-direction:column;gap:2px;cursor:pointer}
  .subtitle{font-size:12px;color:var(--text-muted)}
  .header-right{display:flex;align-items:center;gap:8px}
  .nav-tab{padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);text-decoration:none}
  .nav-tab.active{background:var(--primary);color:white;border-color:var(--primary)}
  .nav-tab:hover:not(.active){background:var(--hover-bg)}
  .theme-toggle{background:none;border:none;cursor:pointer;font-size:18px;padding:4px}
  .user-badge{display:flex;align-items:center;gap:4px;background:var(--hover-bg);border-radius:8px;padding:4px 8px;font-size:13px;font-weight:600}
  .btn-logout{background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:2px 8px;border-left:1px solid var(--border);margin-left:4px}
  .btn-logout:hover{color:var(--danger)}
  .main{padding:24px;max-width:1400px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .ratio-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px}
  .kpi-label{font-size:13px;color:var(--text-muted);font-weight:500;margin-bottom:8px}
  .kpi-value{font-size:28px;font-weight:700;color:var(--text)}
  .kpi-value.negative{color:var(--danger)}
  .kpi-value.positive{color:var(--success)}
  .kpi-sub{font-size:12px;color:var(--text-muted);margin-top:6px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px}
  .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .card h3{font-size:15px;font-weight:700;color:var(--text)}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:10px 12px;border-bottom:2px solid var(--border);color:var(--text-muted);font-weight:600;font-size:12px}
  td{padding:10px 12px;border-bottom:1px solid var(--border);color:var(--text)}
  tr:last-child td{border-bottom:none}
  .amount{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
  .total-row td{font-weight:700;border-top:2px solid var(--border);background:var(--hover-bg)}
  .expense-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border)}
  .expense-row:last-child{border-bottom:none}
  .expense-label{font-size:14px;font-weight:600}
  .expense-amount{font-size:16px;font-weight:700}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-left:8px}
  .badge-fixed{background:#ede9fe;color:#7c3aed}
  .badge-variable{background:#fef3c7;color:#b45309}
  .badge-live{background:#fef9c3;color:#a16207;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .badge-saved{background:#dbeafe;color:#1d4ed8;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .divider{height:1px;background:var(--border);margin:4px 0}
  .btn{padding:8px 16px;border-radius:6px;border:1px solid transparent;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;height:36px}
  .btn-primary{background:var(--primary);color:white}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border)}
  .btn-secondary:hover{background:var(--hover-bg)}
  .btn-sm{padding:5px 12px;font-size:12px;height:30px}
  .edit-input{border:1px solid var(--primary);border-radius:4px;padding:4px 8px;font-size:13px;background:var(--bg);color:var(--text);text-align:right;width:130px;outline:none}
  .form-input{border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:15px;background:var(--bg);color:var(--text);text-align:right;width:180px;outline:none}
  .form-input:focus{border-color:var(--primary)}
  select{border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--surface);color:var(--text);cursor:pointer}
  .filter-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px}
  .edit-banner{background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .dark .edit-banner{background:#1e3a5f;border-color:#3b82f6}
  .input-form{background:var(--surface);border:2px dashed var(--border);border-radius:12px;padding:24px}
  .form-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)}
  .form-row:last-of-type{border-bottom:none}
  .form-label{font-size:14px;font-weight:600}
  .empty-text{color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0}
  @media(max-width:900px){.kpi-row,.ratio-row{grid-template-columns:repeat(2,1fr)}.two-col{grid-template-columns:1fr}}
`

export default function SettlementPage() {
  const router = useRouter()
  const [dark, setDark] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [year, setYear] = useState(0)
  const [month, setMonth] = useState(0)
  const [isCurrentMonth, setIsCurrentMonth] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const [operatingProfit, setOperatingProfit] = useState(0)
  const [totalSales, setTotalSales] = useState(0)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [expenses, setExpenses] = useState<Expenses>({ fixed: 0, variable: 0, total: 0 })

  // 당월 수정용
  const [editEmps, setEditEmps] = useState<Employee[]>([])
  const [editFixed, setEditFixed] = useState(0)
  const [editVariable, setEditVariable] = useState(0)
  const [editRegularTotal, setEditRegularTotal] = useState(0)

  // 과거 월 간소화 입력용
  const [simSalesTeam, setSimSalesTeam] = useState(0)
  const [simRegular, setSimRegular] = useState(0)
  const [simFixed, setSimFixed] = useState(0)
  const [simVariable, setSimVariable] = useState(0)

  // 전월 비교 + 월별 추이
  const [prevRecord, setPrevRecord] = useState<Record<string,number>|null>(null)
  const [monthlyTrend, setMonthlyTrend] = useState<{label:string,final_profit:number,operating_profit:number}[]>([])

  const fmt = (n: number) => n.toLocaleString('ko-KR')
  const fmtSign = (n: number) => (n >= 0 ? '+' : '') + fmt(n)
  const fmtRate = (n: number) => isFinite(n) && n !== 0 ? n.toFixed(1) + '%' : '-'
  const parseNum = (s: string) => { const n = parseFloat(s.replace(/,/g, '')); return isNaN(n) ? 0 : n }

  // 간소화 구조 여부 (영업팀 급여 / 정규직 급여 2항목)
  const isSimple = !isCurrentMonth && employees.some(e => e.name === '영업팀 급여' || e.name === '정규직 급여')

  const individualEmps = isSimple ? [] : employees.filter(e => e.note !== '사대보험')
  const regularEmps = isSimple ? [] : employees.filter(e => e.note === '사대보험')
  const regularTotal = regularEmps.reduce((s, e) => s + e.net, 0)
  const totalPayroll = employees.reduce((s, e) => s + e.net, 0)
  const finalProfit = operatingProfit - totalPayroll - expenses.total
  const payrollRate = totalSales > 0 ? (totalPayroll / totalSales) * 100 : 0
  const expenseRate = totalSales > 0 ? (expenses.total / totalSales) * 100 : 0
  const finalRate = totalSales > 0 ? (finalProfit / totalSales) * 100 : 0

  async function handleLogout() { await supabase.auth.signOut(); router.push('/login') }

  const loadData = useCallback(async (y: number, m: number) => {
    setLoading(true); setEditMode(false)
    const now = new Date()
    const kst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000)
    const isCurrent = y === kst.getFullYear() && m === kst.getMonth() + 1
    setIsCurrentMonth(isCurrent)

    const { data: txData } = await supabase.from('transactions').select('sales,profit').eq('year', y).eq('month', m)
    setOperatingProfit(txData ? txData.reduce((s, t) => s + (t.profit || 0), 0) : 0)
    setTotalSales(txData ? txData.reduce((s, t) => s + (t.sales || 0), 0) : 0)

    // 전월 정산 레코드
    const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1
    const { data: prev } = await supabase.from('settlement_records').select('operating_profit,total_payroll,total_expenses,final_profit').eq('year', prevY).eq('month', prevM).maybeSingle()
    setPrevRecord(prev || null)

    // 월별 추이 (저장된 전체 레코드)
    const { data: trend } = await supabase.from('settlement_records').select('year,month,final_profit,operating_profit').order('year').order('month')
    setMonthlyTrend((trend || []).map(r => ({ label: `${r.year}-${String(r.month).padStart(2,'0')}`, final_profit: r.final_profit, operating_profit: r.operating_profit })))

    const { data: record } = await supabase
      .from('settlement_records').select('*').eq('year', y).eq('month', m).maybeSingle()

    if (record) {
      const emps: Employee[] = record.employees || []
      setEmployees(emps)
      setExpenses({ fixed: record.fixed_expenses, variable: record.variable_expenses, total: record.total_expenses })
      setIsSaved(true)
      setSimSalesTeam(emps.find(e => e.name === '영업팀 급여')?.net || 0)
      setSimRegular(emps.find(e => e.name === '정규직 급여')?.net || 0)
      setSimFixed(record.fixed_expenses)
      setSimVariable(record.variable_expenses)
    } else if (isCurrent) {
      const res = await fetch('/api/settlement')
      const json = await res.json()
      setEmployees(!json.error ? json.employees || [] : [])
      setExpenses(!json.error ? json.expenses || { fixed: 0, variable: 0, total: 0 } : { fixed: 0, variable: 0, total: 0 })
      setIsSaved(false)
    } else {
      setEmployees([]); setExpenses({ fixed: 0, variable: 0, total: 0 })
      setSimSalesTeam(0); setSimRegular(0); setSimFixed(0); setSimVariable(0)
      setIsSaved(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')
      const now = new Date()
      const kst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000)
      const y = kst.getFullYear(), m = kst.getMonth() + 1
      setYear(y); setMonth(m)
      await loadData(y, m)
    }
    init()
  }, [])

  // 당월 저장
  async function handleSave() {
    if (!confirm(`${year}년 ${month}월 정산을 저장하시겠습니까?`)) return
    setSaving(true)
    const { error } = await supabase.from('settlement_records').upsert(
      { year, month, operating_profit: operatingProfit, total_payroll: totalPayroll,
        total_expenses: expenses.total, fixed_expenses: expenses.fixed, variable_expenses: expenses.variable,
        final_profit: finalProfit, employees },
      { onConflict: 'year,month' }
    )
    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장 완료!'); setIsSaved(true) }
    setSaving(false)
  }

  // 과거 월 간소화 저장
  async function handleSimpleSave() {
    if (!confirm(`${year}년 ${month}월 정산을 저장하시겠습니까?`)) return
    setSaving(true)
    const emps: Employee[] = [
      { name: '영업팀 급여', net: simSalesTeam, note: '' },
      { name: '정규직 급여', net: simRegular, note: '정규직' },
    ]
    const totalP = simSalesTeam + simRegular
    const totalE = simFixed + simVariable
    const { error } = await supabase.from('settlement_records').upsert(
      { year, month, operating_profit: operatingProfit, total_payroll: totalP,
        total_expenses: totalE, fixed_expenses: simFixed, variable_expenses: simVariable,
        final_profit: operatingProfit - totalP - totalE, employees: emps },
      { onConflict: 'year,month' }
    )
    if (error) { alert('저장 실패: ' + error.message) }
    else {
      setEmployees(emps)
      setExpenses({ fixed: simFixed, variable: simVariable, total: totalE })
      setIsSaved(true); setEditMode(false)
      alert('✅ 저장 완료!')
    }
    setSaving(false)
  }

  // 당월 수정 시작
  function startEdit() {
    setEditEmps(employees.map(e => ({ ...e })))
    setEditFixed(expenses.fixed); setEditVariable(expenses.variable)
    setEditRegularTotal(regularTotal); setEditMode(true)
  }

  // 과거 월 수정 시작
  function startSimpleEdit() {
    setSimSalesTeam(employees.find(e => e.name === '영업팀 급여')?.net || 0)
    setSimRegular(employees.find(e => e.name === '정규직 급여')?.net || 0)
    setSimFixed(expenses.fixed); setSimVariable(expenses.variable)
    setEditMode(true)
  }

  // 당월 수정 저장
  async function handleSaveEdit() {
    const newEmps: Employee[] = employees.map(e => {
      if (e.note === '사대보험') return e
      const found = editEmps.find(ee => ee.name === e.name)
      return found ? { ...e, net: found.net } : e
    })
    if (regularEmps.length > 0) {
      const per = Math.round(editRegularTotal / regularEmps.length)
      let remain = editRegularTotal, rIdx = 0
      newEmps.forEach((e, i) => {
        if (e.note === '사대보험') {
          rIdx++; const isLast = rIdx === regularEmps.length
          newEmps[i] = { ...e, net: isLast ? remain : per }
          if (!isLast) remain -= per
        }
      })
    }
    const newExp = { fixed: editFixed, variable: editVariable, total: editFixed + editVariable }
    const newPayroll = newEmps.reduce((s, e) => s + e.net, 0)
    setSaving(true)
    const { error } = await supabase.from('settlement_records').update({
      total_payroll: newPayroll, total_expenses: newExp.total,
      fixed_expenses: newExp.fixed, variable_expenses: newExp.variable,
      final_profit: operatingProfit - newPayroll - newExp.total, employees: newEmps,
    }).eq('year', year).eq('month', month)
    if (error) alert('수정 실패: ' + error.message)
    else { setEmployees(newEmps); setExpenses(newExp); setEditMode(false) }
    setSaving(false)
  }

  const years = Array.from({ length: new Date().getFullYear() - 2023 }, (_, i) => 2024 + i)

  return (
    <div className={dark ? 'dark' : ''}>
      <style>{CSS}</style>
      <div className="wrap">
        <header className="app-header">
          <div className="header-logo" onClick={() => router.push('/dashboard')}>
            <img src="/logo.png" alt="illryu" style={{ height: 36, objectFit: 'contain' }} />
            <span className="subtitle">정산 대시보드</span>
          </div>
          <div className="header-right">
            <nav style={{ display: 'flex', gap: 4 }}>
              <a className="nav-tab" href="/dashboard">손익 대시보드</a>
              <a className="nav-tab active" href="/settlement">정산</a>
              <a className="nav-tab" href="/daily-report">일마감</a>
            </nav>
            <button className="theme-toggle" onClick={() => setDark(d => !d)}>{dark ? '☀️' : '🌙'}</button>
            <span className="user-badge">
              <span>{userEmail.split('@')[0]}</span>
              <button className="btn-logout" onClick={handleLogout}>로그아웃</button>
            </span>
          </div>
        </header>

        <main className="main">
          {/* 필터 바 */}
          <div className="filter-bar">
            <span style={{ fontSize: 14, fontWeight: 600 }}>조회 기간</span>
            <select value={year} onChange={e => { const y = +e.target.value; setYear(y); loadData(y, month) }}>
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => { const m = +e.target.value; setMonth(m); loadData(year, m) }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
            <span className={isSaved ? 'badge-saved' : 'badge-live'}>
              {isSaved ? '💾 저장된 데이터' : isCurrentMonth ? '🔴 실시간 (미저장)' : '📭 미저장'}
            </span>
            <div style={{ flex: 1 }} />
            {isCurrentMonth && !isSaved && !loading && (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '💾 이번 달 정산 저장'}
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>로딩 중...</div>
          ) : (<>

            {/* 과거 월 미저장: 간소화 입력 폼 */}
            {!isCurrentMonth && !isSaved && (
              <div className="input-form">
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                  {year}년 {month}월 정산 데이터 입력
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  급여와 지출을 직접 입력하고 저장하세요.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: 1 }}>급여</div>
                    <div className="form-row">
                      <span className="form-label">영업팀 급여</span>
                      <input className="form-input" type="number" value={simSalesTeam || ''} placeholder="0"
                        onChange={e => setSimSalesTeam(parseNum(e.target.value))} />
                    </div>
                    <div className="form-row">
                      <span className="form-label">정규직 급여</span>
                      <input className="form-input" type="number" value={simRegular || ''} placeholder="0"
                        onChange={e => setSimRegular(parseNum(e.target.value))} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: 1 }}>지출</div>
                    <div className="form-row">
                      <span className="form-label">고정 지출</span>
                      <input className="form-input" type="number" value={simFixed || ''} placeholder="0"
                        onChange={e => setSimFixed(parseNum(e.target.value))} />
                    </div>
                    <div className="form-row">
                      <span className="form-label">유동 지출</span>
                      <input className="form-input" type="number" value={simVariable || ''} placeholder="0"
                        onChange={e => setSimVariable(parseNum(e.target.value))} />
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={handleSimpleSave} disabled={saving}>
                    {saving ? '저장 중...' : `💾 ${year}년 ${month}월 정산 저장`}
                  </button>
                </div>
              </div>
            )}

            {/* 수정 모드 배너 (당월) */}
            {editMode && isCurrentMonth && (
              <div className="edit-banner">
                <span style={{ fontSize: 14, fontWeight: 600 }}>✏️ 수정 모드 — 금액 수정 후 저장하세요.</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>취소</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>
                    {saving ? '저장 중...' : '저장 완료'}
                  </button>
                </div>
              </div>
            )}

            {/* ─── 항상 표시: KPI ─── */}
            <section className="kpi-row">
              {[
                { label: '총 영업이익', cur: operatingProfit, prev: prevRecord?.operating_profit, sub: '손익 대시보드 기준', colored: false },
                { label: '총 급여', cur: totalPayroll, prev: prevRecord?.total_payroll, sub: isSimple ? '영업팀 + 정규직' : employees.length > 0 ? `${employees.length}명` : '데이터 없음', colored: false },
                { label: '총 지출', cur: expenses.total, prev: prevRecord?.total_expenses, sub: '고정 + 유동', colored: false },
                { label: '최종 이익', cur: finalProfit, prev: prevRecord?.final_profit, sub: '영업이익 - 급여 - 지출', colored: true },
              ].map(({ label, cur, prev, sub, colored }) => {
                const chg = prev !== undefined && prev !== null && prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null
                return (
                  <div className="kpi-card" key={label}>
                    <div className="kpi-label">{label}</div>
                    <div className={`kpi-value ${colored && cur < 0 ? 'negative' : colored && cur > 0 ? 'positive' : ''}`}>{fmt(cur)}</div>
                    {chg !== null ? (
                      <div style={{ fontSize: 12, marginTop: 6, color: chg >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}% vs 전월
                      </div>
                    ) : <div className="kpi-sub">{sub}</div>}
                  </div>
                )
              })}
            </section>

            {/* ─── 항상 표시: 비율 KPI ─── */}
            <section className="ratio-row">
              <div className="kpi-card" style={{ borderLeft: '3px solid #f59e0b' }}>
                <div className="kpi-label">인건비 비율</div>
                <div className="kpi-value" style={{ fontSize: 32 }}>{fmtRate(payrollRate)}</div>
                <div className="kpi-sub">영업팀 급여 ÷ 총매출</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: '3px solid #a855f7' }}>
                <div className="kpi-label">지출 비율</div>
                <div className="kpi-value" style={{ fontSize: 32 }}>{fmtRate(expenseRate)}</div>
                <div className="kpi-sub">총 지출 ÷ 총매출</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: `3px solid ${finalRate >= 0 ? '#16a34a' : '#dc2626'}` }}>
                <div className="kpi-label">최종 이익률</div>
                <div className={`kpi-value ${finalRate < 0 ? 'negative' : finalRate > 0 ? 'positive' : ''}`} style={{ fontSize: 32 }}>{fmtRate(finalRate)}</div>
                <div className="kpi-sub">최종 이익 ÷ 총매출</div>
              </div>
            </section>

            {/* ─── 항상 표시: 급여 + 지출 ─── */}
            <div className="two-col">
              {/* 급여 현황 */}
              <div className="card">
                <div className="card-header">
                  <h3>영업자별 급여 현황</h3>
                  {isSaved && !editMode && (
                    <button className="btn btn-secondary btn-sm"
                      onClick={isSimple ? startSimpleEdit : startEdit}>✏️ 수정</button>
                  )}
                </div>

                {/* 과거 월 수정 모드 */}
                {editMode && isSimple && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="edit-banner" style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>✏️ 수정 모드</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>취소</button>
                        <button className="btn btn-primary btn-sm" onClick={handleSimpleSave} disabled={saving}>
                          {saving ? '저장 중...' : '저장 완료'}
                        </button>
                      </div>
                    </div>
                    <div className="form-row">
                      <span className="form-label">영업팀 급여</span>
                      <input className="form-input" type="number" value={simSalesTeam || ''}
                        onChange={e => setSimSalesTeam(parseNum(e.target.value))} />
                    </div>
                    <div className="form-row">
                      <span className="form-label">정규직 급여</span>
                      <input className="form-input" type="number" value={simRegular || ''}
                        onChange={e => setSimRegular(parseNum(e.target.value))} />
                    </div>
                  </div>
                )}

                <table>
                  <thead><tr><th>이름</th><th className="amount">지급액(세후)</th></tr></thead>
                  <tbody>
                    {isSimple ? (
                      <>
                        <tr>
                          <td>영업팀 급여</td>
                          <td className="amount">{fmt(employees.find(e => e.name === '영업팀 급여')?.net || 0)}</td>
                        </tr>
                        <tr>
                          <td>정규직 급여</td>
                          <td className="amount">{fmt(employees.find(e => e.name === '정규직 급여')?.net || 0)}</td>
                        </tr>
                      </>
                    ) : individualEmps.length === 0 && regularTotal === 0 ? (
                      <tr><td colSpan={2} className="empty-text">데이터 없음</td></tr>
                    ) : (
                      <>
                        {individualEmps.map((e, i) => (
                          <tr key={i}>
                            <td>{e.name}</td>
                            <td className="amount">
                              {editMode
                                ? <input className="edit-input" defaultValue={e.net}
                                    onChange={ev => setEditEmps(prev => prev.map(ee => ee.name === e.name ? { ...ee, net: parseNum(ev.target.value) } : ee))} />
                                : fmt(e.net || 0)}
                            </td>
                          </tr>
                        ))}
                        {regularTotal > 0 && (
                          <tr>
                            <td style={{ color: 'var(--text-muted)' }}>정규직 급여</td>
                            <td className="amount">
                              {editMode
                                ? <input className="edit-input" defaultValue={editRegularTotal || regularTotal}
                                    onChange={ev => setEditRegularTotal(parseNum(ev.target.value))} />
                                : fmt(regularTotal)}
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td>합계</td>
                      <td className="amount">{fmt(totalPayroll)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 지출 현황 */}
              <div className="card">
                <div className="card-header">
                  <h3>지출 현황</h3>
                  {isSaved && !editMode && (
                    <button className="btn btn-secondary btn-sm"
                      onClick={isSimple ? startSimpleEdit : startEdit}>✏️ 수정</button>
                  )}
                </div>

                {/* 과거 월 지출 수정 모드 */}
                {editMode && isSimple && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="form-row">
                      <span className="form-label">고정 지출</span>
                      <input className="form-input" type="number" value={simFixed || ''}
                        onChange={e => setSimFixed(parseNum(e.target.value))} />
                    </div>
                    <div className="form-row">
                      <span className="form-label">유동 지출</span>
                      <input className="form-input" type="number" value={simVariable || ''}
                        onChange={e => setSimVariable(parseNum(e.target.value))} />
                    </div>
                  </div>
                )}

                <div className="expense-row">
                  <div><span className="expense-label">고정 지출</span><span className="badge badge-fixed">고정</span></div>
                  {editMode && !isSimple
                    ? <input className="edit-input" defaultValue={editFixed} onChange={ev => setEditFixed(parseNum(ev.target.value))} />
                    : <div className="expense-amount">{fmt(expenses.fixed)}</div>}
                </div>
                <div className="expense-row">
                  <div><span className="expense-label">유동 지출</span><span className="badge badge-variable">유동</span></div>
                  {editMode && !isSimple
                    ? <input className="edit-input" defaultValue={editVariable} onChange={ev => setEditVariable(parseNum(ev.target.value))} />
                    : <div className="expense-amount">{fmt(expenses.variable)}</div>}
                </div>
                <div className="divider" />
                <div className="expense-row">
                  <span className="expense-label" style={{ fontSize: 15 }}>총 지출</span>
                  <span className="expense-amount" style={{ fontSize: 20 }}>
                    {editMode && !isSimple ? fmt(editFixed + editVariable) : fmt(expenses.total)}
                  </span>
                </div>

                {/* 최종 정산 내역 */}
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '2px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>최종 정산 내역</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>영업 이익</span>
                      <span>{fmt(operatingProfit)}</span>
                    </div>
                    {isSimple ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>- 영업팀 급여</span>
                          <span style={{ color: 'var(--danger)' }}>-{fmt(employees.find(e => e.name === '영업팀 급여')?.net || 0)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>- 정규직 급여</span>
                          <span style={{ color: 'var(--danger)' }}>-{fmt(employees.find(e => e.name === '정규직 급여')?.net || 0)}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>- 영업자 급여</span>
                        <span style={{ color: 'var(--danger)' }}>-{fmt(totalPayroll)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>- 총 지출</span>
                      <span style={{ color: 'var(--danger)' }}>-{fmt(expenses.total)}</span>
                    </div>
                    <div className="divider" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>최종 손익</span>
                      <span className={`kpi-value ${finalProfit < 0 ? 'negative' : finalProfit > 0 ? 'positive' : ''}`}
                        style={{ fontSize: 22 }}>{fmtSign(finalProfit)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* ─── 월별 최종 이익 추이 ─── */}
            {monthlyTrend.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: 20 }}>월별 최종 이익 추이</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => { const n = Math.abs(Number(v)); return n >= 1000000 ? (n/1000000).toFixed(0)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(n) }} tick={{ fontSize: 11 }} width={60} />
                    <Tooltip formatter={(v: unknown) => [fmt(Number(v)) + '원', '']} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="operating_profit" name="영업이익" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="final_profit" name="최종이익" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {monthlyTrend.length === 0 && (
              <div className="card" style={{ textAlign:'center', color:'var(--text-muted)', padding:'40px 0' }}>
                월별 추이 차트는 정산 데이터가 저장되면 자동으로 표시됩니다.
              </div>
            )}

          </>)}
        </main>
      </div>
    </div>
  )
}
