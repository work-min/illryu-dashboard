import { NextResponse } from 'next/server'
import { importPKCS8, SignJWT } from 'jose'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

async function getAccessToken(): Promise<string> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!
  const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))

  // 키 정규화
  const privateKeyPem: string = (sa.private_key as string)
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim()

  const privateKey = await importPKCS8(privateKeyPem, 'RS256')

  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .sign(privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(data))
  return data.access_token
}

async function fetchSheet(token: string, range: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  return (data.values || []).map((r: unknown[]) => r.map(String))
}

function parseNumber(val: unknown): number {
  if (!val || String(val).trim() === '') return 0
  const cleaned = String(val).replace(/[,\s"]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function getKoreanWeek(dateStr: string): string {
  const date = new Date(dateStr)
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7
  return Math.ceil((date.getDate() + firstDayOfWeek) / 7) + '주차'
}

function findHeaderIdx(rows: string[][], candidates: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (candidates.some(c => rows[i].some(cell => cell.includes(c)))) return i
  }
  return -1
}

function findColIdx(header: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const idx = header.findIndex(h => h.includes(cand))
    if (idx !== -1) return idx
  }
  return -1
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slashMatch) return `2026-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`
  const korMatch = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (korMatch) return `${korMatch[1]}-${korMatch[2].padStart(2,'0')}-${korMatch[3].padStart(2,'0')}`
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10)
  return null
}

function parseListTab(rows: string[][]): object[] {
  const headerIdx = findHeaderIdx(rows, ['날짜', '일자'])
  if (headerIdx === -1) return []
  const header = rows[headerIdx].map(c => c.trim())
  const idx = {
    date:      findColIdx(header, ['날짜', '일자']),
    manager:   findColIdx(header, ['담당자']),
    company:   findColIdx(header, ['대행사', '업체명']),
    tradeName: findColIdx(header, ['상호']),
    sales:     findColIdx(header, ['매출']),
    purchase:  findColIdx(header, ['매입']),
    category:  findColIdx(header, ['구분']),
  }
  if (idx.date === -1) return []

  return rows.slice(headerIdx + 1).flatMap(row => {
    if (!row || row.every(c => !c)) return []
    const dateStr = parseDate(String(row[idx.date] || ''))
    if (!dateStr) return []
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return []
    const sales    = parseNumber(row[idx.sales])
    const purchase = parseNumber(row[idx.purchase])
    const company   = idx.company   !== -1 ? String(row[idx.company]   || '').trim() : ''
    const tradeName = idx.tradeName !== -1 ? String(row[idx.tradeName] || '').trim() : ''
    if (sales === 0 && purchase === 0 && !company && !tradeName) return []
    return [{
      date: dateStr, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
      week: getKoreanWeek(dateStr),
      category: (idx.category !== -1 ? String(row[idx.category] || '').trim() : '') || '(미분류)',
      manager: idx.manager !== -1 ? String(row[idx.manager] || '').trim() : '',
      company, trade_name: tradeName,
      sales, purchase, profit: sales - purchase, source: 'live',
    }]
  })
}

function parseIncomeTab(rows: string[][]): object[] {
  const headerIdx = findHeaderIdx(rows, ['계약일자'])
  if (headerIdx === -1) return []
  const header = rows[headerIdx].map(c => c.trim())
  const idx = {
    date:      findColIdx(header, ['계약일자']),
    category:  2,
    manager:   findColIdx(header, ['담당자']),
    company:   findColIdx(header, ['대행사명']),
    tradeName: findColIdx(header, ['상호명']),
    sales:     findColIdx(header, ['입금금액']),
  }
  if (idx.date === -1) return []

  return rows.slice(headerIdx + 1).flatMap(row => {
    if (!row || row.every(c => !c)) return []
    const dateStr = parseDate(String(row[idx.date] || ''))
    if (!dateStr) return []
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return []
    const sales     = parseNumber(row[idx.sales])
    const company   = idx.company   !== -1 ? String(row[idx.company]   || '').trim() : ''
    const tradeName = idx.tradeName !== -1 ? String(row[idx.tradeName] || '').trim() : ''
    if (sales === 0 && !company && !tradeName) return []
    return [{
      date: dateStr, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
      week: getKoreanWeek(dateStr),
      category: String(row[idx.category] || '(미분류)').trim() || '(미분류)',
      manager: idx.manager !== -1 ? String(row[idx.manager] || '').trim() : '',
      company, trade_name: tradeName,
      sales, purchase: 0, profit: sales, source: 'live',
    }]
  })
}

export async function GET() {
  try {
    const token = await getAccessToken()
    const [listRows, incomeRows] = await Promise.all([
      fetchSheet(token, '리스트!A:S'),
      fetchSheet(token, '귀속 입금건!A:L'),
    ])
    const transactions = [...parseListTab(listRows), ...parseIncomeTab(incomeRows)]
    return NextResponse.json({ transactions, count: transactions.length })
  } catch (err) {
    console.error('Sheets 오류:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
