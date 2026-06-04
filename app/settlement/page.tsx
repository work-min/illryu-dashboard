'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Employee { name: string; net: number; note: string }
interface Expenses { fixed: number; variable: number; total: number }

const CSS = `
  :root { --bg:#f8f7ff;--surface:#fff;--border:#e8e4f3;--text:#1a1523;--text-muted:#6b7280;--primary:#7c3aed;--hover-bg:#f3f0ff;--danger:#dc2626;--success:#16a34a; }
  .dark { --bg:#0f0d1a;--surface:#1a1727;--border:#2d2640;--text:#f0eeff;--text-muted:#9ca3af;--hover-bg:#252035; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'Pretendard','Apple SD Gothic Neo',sans-serif}
  .wrap{min-height:100vh;background:var(--bg)}
  .app-header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
  .header-logo{display:flex;align-items:center;gap:8px;cursor:pointer;flex-direction:column;align-items:flex-start;gap:2px}
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
  .badge-live{background:#dcfce7;color:#16a34a}
  .badge-saved{background:#dbeafe;color:#1d4ed8}
  .divider{height:1px;background:var(--border);margin:4px 0}
  .btn{padding:8px 16px;border-radius:6px;border:1px solid transparent;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
  .btn-primary{background:var(--primary);color:white}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border)}
  .btn-secondary:hover{background:var(--hover-bg)}
  .btn-sm{padding:5px 12px;font-size:12px}
  .edit-input{width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:13px;background:var(--bg);color:var(--text);text-align:right}
  .edit-input:focus{outline:none;border-color:var(--primary)}
  select{border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--surface);color:var(--text);cursor:pointer}
  .filter-bar{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px}
  .status-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  @media(max-width:900px){.kpi-row,.ratio-row{grid-template-columns:repeat(2,1fr)}.two-col{grid-template-columns:1fr}}
`

export default function SettlementPage() {
  const router = useRouter()
  const [dark, setDark] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 년/월 선택
  const [year, setYear] = useState(0)
  const [month, setMonth] = useState(0)

  // 데이터
  const [operatingProfit, setOperatingProfit] = useState(0)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [expenses, setExpenses] = useState<Expenses>({ fixed: 0, variable: 0, total: 0 })
  const [isSaved, setIsSaved] = useState(false)   // DB에 저장된 데이터인지
  const [editMode, setEditMode] = useState(false)

  // 수정용 임시 상태
  const [editEmployees, setEditEmployees] = useState<Employee[]>([])
  const [editFixed, setEditFixed] = useState(0)
  const [editVariable, setEditVariable] = useState(0)
  const [editRegularTotal, setEditRegularTotal] = useState(0)

  const fmt = (n: number) => n.toLocaleString('ko-KR')
  const fmtSign = (n: number) => (n >= 0 ? '+' : '') + fmt(n)
  const fmtRate = (n: number) => isFinite(n) && n !== 0 ? n.toFixed(1) + '%' : '-'
  const parseNum = (s: string) => { const n = parseFloat(s.replace(/,/g, '')); return isNaN(n) ? 0 : n }

  const individualEmployees = employees.filter(e => e.note !== '사대보험')
  const regularEmployees = employees.filter(e => e.note === '사대보험')
  const regularTotal = regularEmployees.reduce((s, e) => s + e.net, 0)
  const totalPayroll = employees.reduce((s, e) => s + e.net, 0)
  const finalProfit = operatingProfit - totalPayroll - expenses.total
  const payrollRate = operatingProfit > 0 ? (totalPayroll / operatingProfit) * 100 : 0
  const expenseRate = operatingProfit > 0 ? (expenses.total / operatingProfit) * 100 : 0
  const finalRate = operatingProfit > 0 ? (finalProfit / operatingProfit) * 100 : 0

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const loadData = useCallback(async (y: number, m: number) => {
    setLoading(true)
    setEditMode(false)

    // 영업이익: transactions DB에서
    const { data: txData } = await supabase
      .from('transactions')
      .select('profit')
      .eq('year', y).eq('month', m)
    const op = txData ? txData.reduce((s, t) => s + (t.profit || 0), 0) : 0
    setOperatingProfit(op)

    // DB에 저장된 정산 데이터 확인
    const res = await fetch(`/api/settlement-record?year=${y}&month=${m}`)
    const { record } = await res.json()

    if (record) {
      // DB 데이터 사용
      setEmployees(record.employees || [])
      setExpenses({ fixed: record.fixed_expenses, variable: record.variable_expenses, total: record.total_expenses })
      setIsSaved(true)
    } else {
      // 구글 시트에서 실시간 로드 (당월만)
      const sheetRes = await fetch('/api/settlement')
      const sheetJson = await sheetRes.json()
      if (!sheetJson.error) {
        setEmployees(sheetJson.employees || [])
        setExpenses(sheetJson.expenses || { fixed: 0, variable: 0, total: 0 })
      } else {
        setEmployees([])
        setExpenses({ fixed: 0, variable: 0, total: 0 })
      }
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
      const y = kst.getFullYear()
      const m = kst.getMonth() + 1
      setYear(y); setMonth(m)
      await loadData(y, m)
    }
    init()
  }, [])

  async function handleSave() {
    if (!confirm(`${year}년 ${month}월 정산 데이터를 저장하시겠습니까?`)) return
    setSaving(true)
    const body = {
      year, month,
      operating_profit: operatingProfit,
      total_payroll: totalPayroll,
      total_expenses: expenses.total,
      fixed_expenses: expenses.fixed,
      variable_expenses: expenses.variable,
      final_profit: finalProfit,
      employees,
    }
    const res = await fetch('/api/settlement-record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (json.error) { alert('저장 실패: ' + json.error) }
    else { alert('✅ 저장 완료!'); setIsSaved(true) }
    setSaving(false)
  }

  function startEdit() {
    setEditEmployees(employees.map(e => ({ ...e })))
    setEditFixed(expenses.fixed)
    setEditVariable(expenses.variable)
    setEditRegularTotal(regularTotal)
    setEditMode(true)
  }

  async function handleSaveEdit() {
    // 수정된 직원 데이터 반영
    const newEmployees: Employee[] = employees.map(e => {
      if (e.note === '사대보험') return e // 정규직은 개별 수정 불가 (합산으로만)
      const found = editEmployees.find(ee => ee.name === e.name)
      return found ? { ...e, net: found.net } : e
    })
    // 정규직 합산 금액 배분: 인원수로 균등 배분
    const regularCount = regularEmployees.length
    if (regularCount > 0) {
      const perPerson = Math.round(editRegularTotal / regularCount)
      let remain = editRegularTotal
      newEmployees.forEach((e, i) => {
        if (e.note === '사대보험') {
          const isLast = newEmployees.filter(ee => ee.note === '사대보험').slice(-1)[0]?.name === e.name
          newEmployees[i] = { ...e, net: isLast ? remain : perPerson }
          if (!isLast) remain -= perPerson
        }
      })
    }
    const newExpenses = { fixed: editFixed, variable: editVariable, total: editFixed + editVariable }
    const newTotalPayroll = newEmployees.reduce((s, e) => s + e.net, 0)
    const newFinalProfit = operatingProfit - newTotalPayroll - newExpenses.total

    setSaving(true)
    const body = {
      year, month,
      total_payroll: newTotalPayroll,
      total_expenses: newExpenses.total,
      fixed_expenses: newExpenses.fixed,
      variable_expenses: newExpenses.variable,
      final_profit: newFinalProfit,
      employees: newEmployees,
    }
    const res = await fetch('/api/settlement-record', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (json.error) { alert('수정 실패: ' + json.error) }
    else {
      setEmployees(newEmployees)
      setExpenses(newExpenses)
      setEditMode(false)
    }
    setSaving(false)
  }

  const years = Array.from({ length: new Date().getFullYear() - 2023 }, (_, i) => 2024 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

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
            </nav>
            <button className="theme-toggle" onClick={() => setDark(d => !d)}>{dark ? '☀️' : '🌙'}</button>
            <span className="user-badge">
              <span>{userEmail.split('@')[0]}</span>
              <button className="btn-logout" onClick={handleLogout}>로그아웃</button>
            </span>
          </div>
        </header>

        <main className="main">
          {/* 필터 + 저장 버튼 */}
          <div className="filter-bar">
            <span style={{ fontSize: 14, fontWeight: 600 }}>조회 기간</span>
            <select value={year} onChange={e => { const y = +e.target.value; setYear(y); loadData(y, month) }}>
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => { const m = +e.target.value; setMonth(m); loadData(year, m) }}>
              {months.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
            <span className={`status-badge ${isSaved ? 'badge-saved' : 'badge-live'}`}>
              {isSaved ? '💾 저장된 데이터' : '🔴 실시간 (미저장)'}
            </span>
            <div style={{ flex: 1 }} />
            {!isSaved && !editMode && (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '💾 이번 달 정산 저장'}
              </button>
            )}
            {isSaved && !editMode && (
              <button className="btn btn-secondary" onClick={startEdit}>✏️ 수정</button>
            )}
            {editMode && (
              <>
                <button className="btn btn-secondary" onClick={() => setEditMode(false)}>취소</button>
                <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? '저장 중...' : '저장'}
                </button>
              </>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>로딩 중...</div>
          ) : (<>
            {/* 주요 KPI */}
            <section className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-label">총 영업이익</div>
                <div className={`kpi-value ${operatingProfit < 0 ? 'negative' : ''}`}>{fmt(operatingProfit)}</div>
                <div className="kpi-sub">손익 대시보드 기준</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">영업팀 총 급여</div>
                <div className="kpi-value">{fmt(totalPayroll)}</div>
                <div className="kpi-sub">{employees.length}명</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">총 지출</div>
                <div className="kpi-value">{fmt(expenses.total)}</div>
                <div className="kpi-sub">고정 + 유동</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">최종 이익</div>
                <div className={`kpi-value ${finalProfit < 0 ? 'negative' : 'positive'}`}>{fmt(finalProfit)}</div>
                <div className="kpi-sub">영업이익 - 급여 - 지출</div>
              </div>
            </section>

            {/* 비율 KPI */}
            <section className="ratio-row">
              <div className="kpi-card" style={{ borderLeft: '3px solid #f59e0b' }}>
                <div className="kpi-label">인건비 비율</div>
                <div className="kpi-value" style={{ fontSize: 32 }}>{fmtRate(payrollRate)}</div>
                <div className="kpi-sub">영업팀 급여 ÷ 영업이익</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: '3px solid #a855f7' }}>
                <div className="kpi-label">지출 비율</div>
                <div className="kpi-value" style={{ fontSize: 32 }}>{fmtRate(expenseRate)}</div>
                <div className="kpi-sub">총 지출 ÷ 영업이익</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: `3px solid ${finalRate >= 0 ? '#16a34a' : '#dc2626'}` }}>
                <div className="kpi-label">최종 이익률</div>
                <div className={`kpi-value ${finalRate < 0 ? 'negative' : 'positive'}`} style={{ fontSize: 32 }}>{fmtRate(finalRate)}</div>
                <div className="kpi-sub">최종 이익 ÷ 영업이익</div>
              </div>
            </section>

            {/* 급여 + 지출 */}
            <div className="two-col">
              <div className="card">
                <div className="card-header">
                  <h3>영업자별 급여 현황</h3>
                  {editMode && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>금액 직접 수정 가능</span>}
                </div>
                <table>
                  <thead>
                    <tr><th>이름</th><th className="amount">지급액(세후)</th></tr>
                  </thead>
                  <tbody>
                    {individualEmployees.map((e, i) => (
                      <tr key={i}>
                        <td>{e.name}</td>
                        <td className="amount">
                          {editMode ? (
                            <input className="edit-input" style={{ width: 120 }}
                              defaultValue={e.net}
                              onChange={ev => setEditEmployees(prev => prev.map(ee => ee.name === e.name ? { ...ee, net: parseNum(ev.target.value) } : ee))}
                            />
                          ) : (e.net ? fmt(e.net) : '-')}
                        </td>
                      </tr>
                    ))}
                    {(regularTotal > 0 || editMode) && (
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>정규직 급여</td>
                        <td className="amount">
                          {editMode ? (
                            <input className="edit-input" style={{ width: 120 }}
                              defaultValue={editRegularTotal || regularTotal}
                              onChange={ev => setEditRegularTotal(parseNum(ev.target.value))}
                            />
                          ) : fmt(regularTotal)}
                        </td>
                      </tr>
                    )}
                    {employees.length === 0 && (
                      <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>데이터 없음</td></tr>
                    )}
                  </tbody>
                  {employees.length > 0 && (
                    <tfoot>
                      <tr className="total-row"><td>합계</td><td className="amount">{fmt(totalPayroll)}</td></tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>지출 현황</h3>
                  {editMode && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>금액 직접 수정 가능</span>}
                </div>
                <div className="expense-row">
                  <div><span className="expense-label">고정 지출</span><span className="badge badge-fixed">고정</span></div>
                  {editMode ? (
                    <input className="edit-input" style={{ width: 140 }}
                      defaultValue={editFixed}
                      onChange={ev => setEditFixed(parseNum(ev.target.value))}
                    />
                  ) : <div className="expense-amount">{fmt(expenses.fixed)}</div>}
                </div>
                <div className="expense-row">
                  <div><span className="expense-label">유동 지출</span><span className="badge badge-variable">유동</span></div>
                  {editMode ? (
                    <input className="edit-input" style={{ width: 140 }}
                      defaultValue={editVariable}
                      onChange={ev => setEditVariable(parseNum(ev.target.value))}
                    />
                  ) : <div className="expense-amount">{fmt(expenses.variable)}</div>}
                </div>
                <div className="divider" />
                <div className="expense-row">
                  <span className="expense-label" style={{ fontSize: 15 }}>총 지출</span>
                  <span className="expense-amount" style={{ fontSize: 20 }}>
                    {editMode ? fmt(editFixed + editVariable) : fmt(expenses.total)}
                  </span>
                </div>

                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '2px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>최종 정산</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>영업 이익</span><span>{fmt(operatingProfit)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>- 영업자 급여</span>
                      <span style={{ color: 'var(--danger)' }}>-{fmt(totalPayroll)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>- 총 지출</span>
                      <span style={{ color: 'var(--danger)' }}>-{fmt(expenses.total)}</span>
                    </div>
                    <div className="divider" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>최종 손익</span>
                      <span className={`kpi-value ${finalProfit < 0 ? 'negative' : 'positive'}`} style={{ fontSize: 22 }}>{fmtSign(finalProfit)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>)}
        </main>
      </div>
    </div>
  )
}
