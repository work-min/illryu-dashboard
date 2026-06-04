'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Employee {
  name: string
  gross: number
  net: number
  extra: number
  cash: number
  note: string
}

interface Expenses {
  fixed: number
  variable: number
  total: number
}

export default function SettlementPage() {
  const router = useRouter()


  const [dark, setDark] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [yearMonth, setYearMonth] = useState({ year: 0, month: 0 })
  const [operatingProfit, setOperatingProfit] = useState(0)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [expenses, setExpenses] = useState<Expenses>({ fixed: 0, variable: 0, total: 0 })

  const fmt = (n: number) => n.toLocaleString('ko-KR')
  const fmtSign = (n: number) => (n >= 0 ? '+' : '') + fmt(n)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')

      const now = new Date()
      const kst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000)
      const year = kst.getFullYear()
      const month = kst.getMonth() + 1
      setYearMonth({ year, month })

      const { data: txData } = await supabase
        .from('transactions')
        .select('profit')
        .eq('year', year)
        .eq('month', month)

      if (txData) {
        setOperatingProfit(txData.reduce((s, t) => s + (t.profit || 0), 0))
      }

      const res = await fetch('/api/settlement')
      const json = await res.json()
      if (!json.error) {
        setEmployees(json.employees || [])
        setExpenses(json.expenses || { fixed: 0, variable: 0, total: 0 })
      }

      setLoading(false)
    }
    init()
  }, [])

  const individualEmployees = employees.filter(e => e.note !== '사대보험')
  const regularEmployees = employees.filter(e => e.note === '사대보험')
  const regularTotal = regularEmployees.reduce((s, e) => s + e.net, 0)
  const totalPayroll = employees.reduce((s, e) => s + e.net, 0)
  const finalProfit = operatingProfit - totalPayroll - expenses.total

  const fmtRate = (n: number) => (isFinite(n) ? n.toFixed(1) + '%' : '-')
  const payrollRate = operatingProfit > 0 ? (totalPayroll / operatingProfit) * 100 : 0
  const expenseRate = operatingProfit > 0 ? (expenses.total / operatingProfit) * 100 : 0
  const finalRate = operatingProfit > 0 ? (finalProfit / operatingProfit) * 100 : 0

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 18, fontFamily: 'sans-serif' }}>
      로딩 중...
    </div>
  )

  return (
    <div className={dark ? 'dark' : ''}>
      <style>{`
        :root {
          --bg: #f8f7ff; --surface: #ffffff; --border: #e8e4f3;
          --text: #1a1523; --text-muted: #6b7280; --primary: #7c3aed;
          --primary-dark: #6d28d9; --hover-bg: #f3f0ff;
          --danger: #dc2626; --success: #16a34a;
        }
        .dark {
          --bg: #0f0d1a; --surface: #1a1727; --border: #2d2640;
          --text: #f0eeff; --text-muted: #9ca3af; --hover-bg: #252035;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; }
        .wrap { min-height: 100vh; background: var(--bg); }
        .app-header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        .header-left { display: flex; flex-direction: column; gap: 2px; }
        .header-logo { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .header-logo img { height: 36px; object-fit: contain; }
        .subtitle { font-size: 12px; color: var(--text-muted); }
        .header-right { display: flex; align-items: center; gap: 8px; }
        .nav-tabs { display: flex; gap: 4px; margin-left: 16px; }
        .nav-tab { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); text-decoration: none; }
        .nav-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
        .nav-tab:hover:not(.active) { background: var(--hover-bg); }
        .theme-toggle { background: none; border: none; cursor: pointer; font-size: 18px; padding: 4px; }
        .user-badge { display: flex; align-items: center; gap: 4px; background: var(--hover-bg); border-radius: 8px; padding: 4px 8px; font-size: 13px; font-weight: 600; }
        .btn-logout { background: transparent; border: none; cursor: pointer; color: var(--text-muted); font-size: 12px; padding: 2px 8px; border-left: 1px solid var(--border); margin-left: 4px; }
        .btn-logout:hover { color: var(--danger); }
        .main { padding: 24px; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .page-title { font-size: 20px; font-weight: 700; color: var(--text); }
        .page-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; }
        .kpi-label { font-size: 13px; color: var(--text-muted); font-weight: 500; margin-bottom: 8px; }
        .kpi-value { font-size: 28px; font-weight: 700; color: var(--text); }
        .kpi-value.negative { color: var(--danger); }
        .kpi-value.positive { color: var(--success); }
        .kpi-sub { font-size: 12px; color: var(--text-muted); margin-top: 6px; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; }
        .card h3 { font-size: 15px; font-weight: 700; margin-bottom: 16px; color: var(--text); }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; padding: 10px 12px; border-bottom: 2px solid var(--border); color: var(--text-muted); font-weight: 600; font-size: 12px; }
        td { padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--text); }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--hover-bg); }
        .amount { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
        .total-row td { font-weight: 700; border-top: 2px solid var(--border); background: var(--hover-bg); }
        .expense-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid var(--border); }
        .expense-row:last-child { border-bottom: none; }
        .expense-label { font-size: 14px; font-weight: 600; color: var(--text); }
        .expense-amount { font-size: 16px; font-weight: 700; color: var(--text); }
        .expense-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px; }
        .badge-fixed { background: #ede9fe; color: #7c3aed; }
        .badge-variable { background: #fef3c7; color: #b45309; }
        .divider { height: 1px; background: var(--border); margin: 4px 0; }
        .final-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 0 0; }
        .final-label { font-size: 15px; font-weight: 700; }
        .final-amount { font-size: 22px; font-weight: 800; }
        @media (max-width: 900px) {
          .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .two-col { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="wrap">
        <header className="app-header">
          <div className="header-left">
            <div className="header-logo" onClick={() => router.push('/dashboard')}>
              <img src="/logo.png" alt="illryu" />
            </div>
            <p className="subtitle">정산 대시보드</p>
          </div>
          <div className="header-right">
            <nav className="nav-tabs">
              <a className="nav-tab" href="/dashboard">손익 대시보드</a>
              <a className="nav-tab active" href="/settlement">정산</a>
            </nav>
            <button className="theme-toggle" onClick={() => setDark(d => !d)} title="다크/라이트 모드">
              {dark ? '☀️' : '🌙'}
            </button>
            <span className="user-badge">
              <span>{userEmail.split('@')[0]}</span>
              <button className="btn-logout" onClick={handleLogout}>로그아웃</button>
            </span>
          </div>
        </header>

        <main className="main">
          <div>
            <div className="page-title">정산 대시보드</div>
            <div className="page-subtitle">{yearMonth.year}년 {yearMonth.month}월 기준</div>
          </div>

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

          {/* 보조 KPI (비율 지표) */}
          <section style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'16px'}}>
            <div className="kpi-card" style={{borderLeft:'3px solid #f59e0b'}}>
              <div className="kpi-label">인건비 비율</div>
              <div className="kpi-value" style={{fontSize:'32px'}}>{fmtRate(payrollRate)}</div>
              <div className="kpi-sub">영업팀 급여 ÷ 영업이익</div>
            </div>
            <div className="kpi-card" style={{borderLeft:'3px solid #a855f7'}}>
              <div className="kpi-label">지출 비율</div>
              <div className="kpi-value" style={{fontSize:'32px'}}>{fmtRate(expenseRate)}</div>
              <div className="kpi-sub">총 지출 ÷ 영업이익</div>
            </div>
            <div className="kpi-card" style={{borderLeft:`3px solid ${finalRate >= 0 ? '#16a34a' : '#dc2626'}`}}>
              <div className="kpi-label">최종 이익률</div>
              <div className={`kpi-value ${finalRate < 0 ? 'negative' : 'positive'}`} style={{fontSize:'32px'}}>{fmtRate(finalRate)}</div>
              <div className="kpi-sub">최종 이익 ÷ 영업이익</div>
            </div>
          </section>

          {/* 영업자별 급여 + 지출 */}
          <div className="two-col">
            <div className="card">
              <h3>영업자별 급여 현황</h3>
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th className="amount">지급액(세후)</th>
                  </tr>
                </thead>
                <tbody>
                  {individualEmployees.map((e, i) => (
                    <tr key={i}>
                      <td>{e.name}</td>
                      <td className="amount">{e.net ? fmt(e.net) : '-'}</td>
                    </tr>
                  ))}
                  {regularTotal > 0 && (
                    <tr>
                      <td style={{ color: 'var(--text-muted)' }}>정규직 급여</td>
                      <td className="amount">{fmt(regularTotal)}</td>
                    </tr>
                  )}
                  {employees.length === 0 && (
                    <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>데이터 없음</td></tr>
                  )}
                </tbody>
                {employees.length > 0 && (
                  <tfoot>
                    <tr className="total-row">
                      <td>합계</td>
                      <td className="amount">{fmt(totalPayroll)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="card">
              <h3>지출 현황</h3>
              <div className="expense-row">
                <div>
                  <span className="expense-label">고정 지출</span>
                  <span className="expense-badge badge-fixed">고정</span>
                </div>
                <div className="expense-amount">{fmt(expenses.fixed)}</div>
              </div>
              <div className="expense-row">
                <div>
                  <span className="expense-label">유동 지출</span>
                  <span className="expense-badge badge-variable">유동</span>
                </div>
                <div className="expense-amount">{fmt(expenses.variable)}</div>
              </div>
              <div className="divider" />
              <div className="expense-row">
                <span className="expense-label" style={{ fontSize: 15 }}>총 지출</span>
                <span className="expense-amount" style={{ fontSize: 20 }}>{fmt(expenses.total)}</span>
              </div>

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '2px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>최종 정산</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>영업 이익</span>
                    <span>{fmt(operatingProfit)}</span>
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
                  <div className="final-row">
                    <span className="final-label">최종 손익</span>
                    <span className={`final-amount ${finalProfit < 0 ? 'negative' : 'positive'}`}>{fmtSign(finalProfit)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
