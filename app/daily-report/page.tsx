'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/* ───── 타입 ───── */
interface Transfer {
  id: string
  amount: string
  description: string
  category: string
  note: string
}

interface Item { name: string; amount: number }

/* ───── 유틸 ───── */
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR')
const parseAmt = (s: string) => { const n = parseFloat(s.replace(/,/g, '')); return isNaN(n) ? 0 : n }
const uid = () => Math.random().toString(36).slice(2)
const todayKST = () => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/* ───── 엑셀 붙여넣기 파싱 ───── */
function parseExcelPaste(text: string): Transfer[] {
  return text.trim().split('\n').flatMap(line => {
    const trimmed = line.trim()
    if (!trimmed) return []

    let amount = '', description = ''

    if (trimmed.includes('\t')) {
      // 엑셀 기본: 탭 구분
      const parts = trimmed.split('\t').map(p => p.trim())
      amount = parts[0].replace(/,/g, '')
      description = parts.slice(1).join(' ').trim()
    } else {
      // 공백 구분: 앞쪽 숫자(콤마 포함, 마이너스 허용) + 나머지 텍스트
      const match = trimmed.match(/^(-?[\d,]+)\s+(.+)$/)
      if (match) {
        amount = match[1].replace(/,/g, '')
        description = match[2].trim()
      }
    }

    if (!amount || !description || isNaN(Number(amount))) return []
    return [{ id: uid(), amount, description, category: '', note: '' }]
  })
}

/* ───── 보고서 생성 ───── */
function buildReport(
  date: string,
  transfers: Transfer[],
  receivables: Item[],
  payables: Item[],
  notes: string
): string {
  const d = new Date(date + 'T00:00:00')
  const lines: string[] = [`${d.getMonth() + 1}/${d.getDate()}`]

  const validTransfers = transfers.filter(t => parseAmt(t.amount) !== 0 && t.description.trim())
  if (validTransfers.length > 0) {
    lines.push('')
    for (const t of validTransfers) {
      const amtStr = fmt(parseAmt(t.amount))
      const desc = t.description.trim()
      const note = t.note.trim()
      lines.push(note ? `${amtStr} ${desc} (${note})` : `${amtStr} ${desc}`)
    }
    lines.push('')
    lines.push(`총 ${fmt(validTransfers.reduce((s, t) => s + parseAmt(t.amount), 0))}`)
  }

  const validRcv = receivables.filter(r => r.amount !== 0 && r.name.trim())
  if (validRcv.length > 0) {
    lines.push('')
    lines.push('<미수>')
    for (const r of validRcv) lines.push(`${r.name} ${fmt(r.amount)}`)
    lines.push('')
    lines.push(`총 ${fmt(validRcv.reduce((s, r) => s + r.amount, 0))}`)
  }

  const validPay = payables.filter(p => p.amount !== 0 && p.name.trim())
  if (validPay.length > 0) {
    lines.push('')
    lines.push('<미지급>')
    for (const p of validPay) lines.push(`${p.name} ${fmt(p.amount)}`)
    lines.push('')
    lines.push(`총 ${fmt(validPay.reduce((s, p) => s + p.amount, 0))}`)
  }

  if (notes.trim()) {
    lines.push('')
    lines.push('[특이사항]')
    lines.push(notes.trim())
  }

  return lines.join('\n')
}

/* ───── CSS ───── */
const CSS = `
  :root{--bg:#f8f7ff;--surface:#fff;--border:#e8e4f3;--text:#1a1523;--text-muted:#6b7280;--primary:#7c3aed;--hover-bg:#f3f0ff;--danger:#dc2626;--success:#16a34a}
  .dark{--bg:#0f0d1a;--surface:#1a1727;--border:#2d2640;--text:#f0eeff;--text-muted:#9ca3af;--hover-bg:#252035}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'Pretendard','Apple SD Gothic Neo',sans-serif}
  .wrap{min-height:100vh;background:var(--bg)}
  .app-header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
  .header-logo{display:flex;flex-direction:column;gap:2px;cursor:pointer}
  .header-title{font-size:16px;font-weight:700;color:var(--text)}
  .subtitle{font-size:12px;color:var(--text-muted)}
  .header-right{display:flex;align-items:center;gap:8px}
  .nav-tab{padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);text-decoration:none;cursor:pointer}
  .nav-tab.active{background:var(--primary);color:white;border-color:var(--primary)}
  .nav-tab:hover:not(.active){background:var(--hover-bg)}
  .theme-toggle{background:none;border:none;cursor:pointer;font-size:18px;padding:4px}
  .user-badge{display:flex;align-items:center;gap:4px;background:var(--hover-bg);border-radius:8px;padding:4px 8px;font-size:13px;font-weight:600}
  .btn-logout{background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:2px 8px;border-left:1px solid var(--border);margin-left:4px}
  .btn-logout:hover{color:var(--danger)}
  .main{padding:24px;max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px}
  .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px}
  .card h3{font-size:15px;font-weight:700;color:var(--text)}
  .btn{padding:8px 16px;border-radius:6px;border:1px solid transparent;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;height:36px;display:inline-flex;align-items:center;gap:6px}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn-primary{background:var(--primary);color:white}
  .btn-primary:hover:not(:disabled){opacity:.9}
  .btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border)}
  .btn-secondary:hover:not(:disabled){background:var(--hover-bg)}
  .btn-danger{background:transparent;border:none;color:var(--danger);cursor:pointer;padding:4px 8px;font-size:13px;border-radius:4px}
  .btn-danger:hover{background:#fef2f2}
  .btn-sm{padding:5px 12px;font-size:12px;height:30px}
  .btn-add{background:none;border:1px dashed var(--border);color:var(--text-muted);border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer;width:100%;margin-top:8px}
  .btn-add:hover{background:var(--hover-bg);border-color:var(--primary);color:var(--primary)}
  .top-bar{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .date-label{font-size:13px;font-weight:600;color:var(--text-muted)}
  input[type=date]{border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:14px;background:var(--bg);color:var(--text);cursor:pointer;font-family:inherit}
  input[type=date]:focus{outline:none;border-color:var(--primary)}
  .field{border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px;background:var(--bg);color:var(--text);font-family:inherit}
  .field:focus{outline:none;border-color:var(--primary)}
  .field-amt{width:110px;text-align:right}
  .field-desc{flex:1;min-width:120px}
  .field-cat{width:100px}
  .field-note{width:130px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);color:var(--text-muted);font-weight:600;font-size:12px;white-space:nowrap}
  td{padding:6px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  .total-row td{font-weight:700;border-top:2px solid var(--border);background:var(--hover-bg);font-size:14px}
  .amount-cell{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .report-box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:20px;font-family:'Courier New',Courier,monospace;font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-all;min-height:200px;color:var(--text)}
  .copy-row{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  .save-status{font-size:12px;color:var(--success);font-weight:600}
  .loading-mask{color:var(--text-muted);font-size:13px;padding:12px 0}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  textarea.field{width:100%;resize:vertical;min-height:80px;padding:10px}
  .empty-hint{color:var(--text-muted);font-size:13px;padding:16px 0;text-align:center}
  .paste-zone{width:100%;min-height:72px;resize:vertical;padding:10px 12px;font-size:13px;font-family:'Courier New',monospace;border:2px dashed var(--primary);border-radius:8px;background:var(--hover-bg);color:var(--text);line-height:1.6}
  .paste-zone:focus{outline:none;background:var(--surface)}
  .paste-hint{font-size:11px;color:var(--text-muted);margin-top:5px}
  .section-divider{height:1px;background:var(--border);margin:14px 0}
  @media(max-width:800px){.two-col{grid-template-columns:1fr}}
`

/* ───── 메인 컴포넌트 ───── */
export default function DailyReportPage() {
  const router = useRouter()
  const [dark, setDark] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [authLoading, setAuthLoading] = useState(true)

  const [date, setDate] = useState(todayKST)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [receivables, setReceivables] = useState<Item[]>([])
  const [payables, setPayables] = useState<Item[]>([])
  const [notes, setNotes] = useState('')

  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [copied, setCopied] = useState(false)
  const [pasteFlash, setPasteFlash] = useState(false)  // 붙여넣기 성공 피드백

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [dark])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUserEmail(data.user.email || '')
      setAuthLoading(false)
    })
  }, [router])

  const loadSaved = useCallback(async (d: string) => {
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('date', d)
      .maybeSingle()
    if (data) {
      setTransfers((data.transfers || []).map((t: Record<string, unknown>) => ({ ...t, id: uid(), amount: String(t.amount ?? '') })))
      setReceivables(data.receivables || [])
      setPayables(data.payables || [])
      setNotes(data.notes || '')
    } else {
      setTransfers([]); setReceivables([]); setPayables([]); setNotes('')
    }
  }, [])

  useEffect(() => {
    if (!authLoading && date) loadSaved(date)
  }, [date, authLoading, loadSaved])

  async function loadFromSheets() {
    setSheetsLoading(true)
    try {
      const res = await fetch('/api/daily-report/sheets')
      const json = await res.json()
      if (json.error) { alert('시트 오류: ' + json.error); return }
      setReceivables(json.receivables || [])
      setPayables(json.payables || [])
    } catch (e) {
      alert('시트 불러오기 실패: ' + String(e))
    } finally {
      setSheetsLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true); setSaveStatus('')
    const { error } = await supabase
      .from('daily_reports')
      .upsert(
        {
          date,
          transfers: transfers.map(({ id: _id, ...rest }) => ({ ...rest, amount: parseAmt(rest.amount) })),
          receivables,
          payables,
          notes,
        },
        { onConflict: 'date' }
      )
    setSaving(false)
    if (error) { alert('저장 실패: ' + error.message); return }
    setSaveStatus('저장됨')
    setTimeout(() => setSaveStatus(''), 3000)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildReport(date, transfers, receivables, payables, notes))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* 엑셀 붙여넣기 처리 */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const parsed = parseExcelPaste(text)
    if (parsed.length > 0) {
      setTransfers(prev => [...prev, ...parsed])
      setPasteFlash(true)
      setTimeout(() => setPasteFlash(false), 1500)
    }
    // textarea 내용 비우기 (e.currentTarget은 이미 cleared됨)
    e.currentTarget.value = ''
  }

  const addTransfer = () => setTransfers(prev => [...prev, { id: uid(), amount: '', description: '', category: '', note: '' }])
  const updateTransfer = (id: string, field: keyof Omit<Transfer, 'id'>, value: string) =>
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  const removeTransfer = (id: string) => setTransfers(prev => prev.filter(t => t.id !== id))

  const addRcv = () => setReceivables(prev => [...prev, { name: '', amount: 0 }])
  const updateRcv = (i: number, field: keyof Item, value: string) =>
    setReceivables(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: field === 'amount' ? parseAmt(value) : value } : r))
  const removeRcv = (i: number) => setReceivables(prev => prev.filter((_, idx) => idx !== i))

  const addPay = () => setPayables(prev => [...prev, { name: '', amount: 0 }])
  const updatePay = (i: number, field: keyof Item, value: string) =>
    setPayables(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: field === 'amount' ? parseAmt(value) : value } : p))
  const removePay = (i: number) => setPayables(prev => prev.filter((_, idx) => idx !== i))

  if (authLoading) return null

  const transferTotal = transfers.reduce((s, t) => s + parseAmt(t.amount), 0)
  const rcvTotal = receivables.reduce((s, r) => s + r.amount, 0)
  const payTotal = payables.reduce((s, p) => s + p.amount, 0)
  const report = buildReport(date, transfers, receivables, payables, notes)

  return (
    <div className="wrap">
      <style>{CSS}</style>

      <header className="app-header">
        <div className="header-logo" onClick={() => router.push('/dashboard')}>
          <span className="header-title">일류기획</span>
          <span className="subtitle">손익 보고 대시보드</span>
        </div>
        <div className="header-right">
          <a className="nav-tab" href="/dashboard">손익 대시보드</a>
          <a className="nav-tab" href="/settlement">정산</a>
          <a className="nav-tab active" href="/daily-report">일마감</a>
          <button className="theme-toggle" onClick={() => setDark(d => !d)}>{dark ? '☀️' : '🌙'}</button>
          <div className="user-badge">
            {userEmail}
            <button className="btn-logout" onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>로그아웃</button>
          </div>
        </div>
      </header>

      <main className="main">

        <div className="top-bar">
          <span className="date-label">보고 날짜</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn btn-secondary" onClick={loadFromSheets} disabled={sheetsLoading}>
            {sheetsLoading ? '불러오는 중...' : '📊 시트에서 미수/미지급 불러오기'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '💾 저장'}
          </button>
          {saveStatus && <span className="save-status">✓ {saveStatus}</span>}
        </div>

        <div className="two-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* 이체 내역 */}
            <div className="card">
              <div className="card-header">
                <h3>이체 내역</h3>
                {transferTotal !== 0 && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>합계 {fmt(transferTotal)}</span>}
              </div>

              {/* 엑셀 붙여넣기 영역 */}
              <div style={{ marginBottom: 12 }}>
                <textarea
                  className="paste-zone"
                  placeholder={'엑셀에서 여러 행 복사 후 여기에 붙여넣기\n예) 206360  4일 퍼플페퍼\n    895862  퀀텀 충전'}
                  onPaste={handlePaste}
                  style={{ borderColor: pasteFlash ? 'var(--success)' : undefined }}
                  readOnly={false}
                />
                <p className="paste-hint">
                  {pasteFlash
                    ? '✓ 이체 내역이 추가되었습니다'
                    : '엑셀 셀(금액 + 내용)을 복사하여 붙여넣으면 자동으로 분리됩니다'}
                </p>
              </div>

              {transfers.length > 0 && (
                <>
                  <div className="section-divider" />
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 110 }}>금액</th>
                        <th>내용</th>
                        <th style={{ width: 100 }}>구분</th>
                        <th style={{ width: 130 }}>비고</th>
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map(t => (
                        <tr key={t.id}>
                          <td>
                            <input className="field field-amt" type="text" inputMode="numeric"
                              placeholder="0" value={t.amount}
                              onChange={e => updateTransfer(t.id, 'amount', e.target.value)} />
                          </td>
                          <td>
                            <input className="field field-desc" type="text" placeholder="내용"
                              value={t.description}
                              onChange={e => updateTransfer(t.id, 'description', e.target.value)} />
                          </td>
                          <td>
                            <input className="field field-cat" type="text" placeholder="구분"
                              value={t.category}
                              onChange={e => updateTransfer(t.id, 'category', e.target.value)} />
                          </td>
                          <td>
                            <input className="field field-note" type="text" placeholder="비고"
                              value={t.note}
                              onChange={e => updateTransfer(t.id, 'note', e.target.value)} />
                          </td>
                          <td>
                            <button className="btn-danger" onClick={() => removeTransfer(t.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                      {transferTotal !== 0 && (
                        <tr className="total-row">
                          <td colSpan={5} style={{ textAlign: 'right' }}>총 {fmt(transferTotal)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}
              <button className="btn-add" onClick={addTransfer}>+ 직접 추가</button>
            </div>

            {/* 특이사항 */}
            <div className="card">
              <div className="card-header"><h3>특이사항</h3></div>
              <textarea className="field" placeholder="특이사항을 입력하세요 (선택)"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {/* 미수금 */}
            <div className="card">
              <div className="card-header">
                <h3>미수금</h3>
                {rcvTotal > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>합계 {fmt(rcvTotal)}</span>}
              </div>
              {sheetsLoading && <p className="loading-mask">시트에서 불러오는 중...</p>}
              {!sheetsLoading && receivables.length === 0 && (
                <p className="empty-hint">상단 버튼으로 시트에서 불러오거나, 직접 추가하세요.</p>
              )}
              {receivables.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>업체명</th>
                      <th style={{ width: 130, textAlign: 'right' }}>금액</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivables.map((r, i) => (
                      <tr key={i}>
                        <td><input className="field field-desc" type="text" value={r.name}
                          onChange={e => updateRcv(i, 'name', e.target.value)} /></td>
                        <td><input className="field field-amt" type="text" inputMode="numeric"
                          value={r.amount === 0 ? '' : r.amount.toLocaleString('ko-KR')}
                          onChange={e => updateRcv(i, 'amount', e.target.value)} /></td>
                        <td><button className="btn-danger" onClick={() => removeRcv(i)}>✕</button></td>
                      </tr>
                    ))}
                    {rcvTotal > 0 && (
                      <tr className="total-row">
                        <td>합계</td><td className="amount-cell">{fmt(rcvTotal)}</td><td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
              <button className="btn-add" onClick={addRcv}>+ 미수금 항목 추가</button>
            </div>

            {/* 미지급금 */}
            <div className="card">
              <div className="card-header">
                <h3>미지급금</h3>
                {payTotal > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>합계 {fmt(payTotal)}</span>}
              </div>
              {sheetsLoading && <p className="loading-mask">시트에서 불러오는 중...</p>}
              {!sheetsLoading && payables.length === 0 && (
                <p className="empty-hint">상단 버튼으로 시트에서 불러오거나, 직접 추가하세요.</p>
              )}
              {payables.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>항목명</th>
                      <th style={{ width: 130, textAlign: 'right' }}>금액</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payables.map((p, i) => (
                      <tr key={i}>
                        <td><input className="field field-desc" type="text" value={p.name}
                          onChange={e => updatePay(i, 'name', e.target.value)} /></td>
                        <td><input className="field field-amt" type="text" inputMode="numeric"
                          value={p.amount === 0 ? '' : p.amount.toLocaleString('ko-KR')}
                          onChange={e => updatePay(i, 'amount', e.target.value)} /></td>
                        <td><button className="btn-danger" onClick={() => removePay(i)}>✕</button></td>
                      </tr>
                    ))}
                    {payTotal > 0 && (
                      <tr className="total-row">
                        <td>합계</td><td className="amount-cell">{fmt(payTotal)}</td><td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
              <button className="btn-add" onClick={addPay}>+ 미지급금 항목 추가</button>
            </div>

          </div>

          {/* 보고서 미리보기 */}
          <div className="card" style={{ position: 'sticky', top: 80, alignSelf: 'flex-start' }}>
            <div className="card-header">
              <h3>보고서 미리보기</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>입력 즉시 반영</span>
            </div>
            <div className="report-box">{report || '내용을 입력하면 여기에 자동 생성됩니다.'}</div>
            <div className="copy-row">
              <button className="btn btn-primary" onClick={handleCopy} disabled={!report}>
                {copied ? '✓ 복사됨' : '📋 복사하기'}
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
