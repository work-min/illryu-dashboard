import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!
  const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))
  return new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
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
  const weekNum = Math.ceil((date.getDate() + firstDayOfWeek) / 7)
  return weekNum + '주차'
}

function findHeaderIdx(rows: string[][], candidates: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (candidates.some(c => rows[i].some(cell => String(cell).includes(c)))) return i
  }
  return -1
}

function findColIdx(header: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const idx = header.findIndex(h => String(h).includes(cand))
    if (idx !== -1) return idx
  }
  return -1
}

function parseListTab(rows: string[][]): object[] {
  const headerIdx = findHeaderIdx(rows, ['날짜', '일자'])
  if (headerIdx === -1) return []
  const header = rows[headerIdx].map(c => String(c).trim())

  const idx = {
    date:      findColIdx(header, ['날짜', '일자']),
    manager:   findColIdx(header, ['담당자', '담당']),
    company:   findColIdx(header, ['대행사', '업체명']),
    tradeName: findColIdx(header, ['상호']),
    sales:     findColIdx(header, ['매출']),
    purchase:  findColIdx(header, ['매입']),
    category:  findColIdx(header, ['구분']),
  }
  if (idx.date === -1) return []

  const results: object[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) continue

    const rawDate = idx.date !== -1 ? String(row[idx.date] || '').trim() : ''
    if (!rawDate) continue

    // 날짜 파싱: M/D 또는 YYYY-MM-DD
    let dateStr = ''
    const slashMatch = rawDate.match(/^(\d{1,2})\/(\d{1,2})$/)
    const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (slashMatch) {
      dateStr = `2026-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`
    } else if (isoMatch) {
      dateStr = rawDate.slice(0, 10)
    } else continue

    const dateObj = new Date(dateStr)
    if (isNaN(dateObj.getTime())) continue

    const sales    = parseNumber(row[idx.sales])
    const purchase = parseNumber(row[idx.purchase])
    const company   = idx.company   !== -1 ? String(row[idx.company]   || '').trim() : ''
    const tradeName = idx.tradeName !== -1 ? String(row[idx.tradeName] || '').trim() : ''
    const category  = idx.category  !== -1 ? String(row[idx.category]  || '(미분류)').trim() : '(미분류)'
    const manager   = idx.manager   !== -1 ? String(row[idx.manager]   || '').trim() : ''

    if (sales === 0 && purchase === 0 && !company && !tradeName) continue

    results.push({
      date: dateStr,
      year: dateObj.getFullYear(),
      month: dateObj.getMonth() + 1,
      day: dateObj.getDate(),
      week: getKoreanWeek(dateStr),
      category: category || '(미분류)',
      manager, company,
      trade_name: tradeName,
      sales, purchase,
      profit: sales - purchase,
      source: 'live',
    })
  }
  return results
}

function parseIncomeTab(rows: string[][]): object[] {
  const headerIdx = findHeaderIdx(rows, ['계약일자'])
  if (headerIdx === -1) return []
  const header = rows[headerIdx].map(c => String(c).trim())

  const idx = {
    date:      findColIdx(header, ['계약일자']),
    category:  2,
    manager:   findColIdx(header, ['담당자']),
    company:   findColIdx(header, ['대행사명']),
    tradeName: findColIdx(header, ['상호명']),
    sales:     findColIdx(header, ['입금금액']),
  }
  if (idx.date === -1) return []

  const results: object[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) continue

    const rawDate = String(row[idx.date] || '').trim()
    if (!rawDate) continue

    // "2026년 5월 8일" 형식
    const korMatch = rawDate.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
    let dateStr = ''
    if (korMatch) {
      dateStr = `${korMatch[1]}-${korMatch[2].padStart(2,'0')}-${korMatch[3].padStart(2,'0')}`
    } else if (rawDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      dateStr = rawDate.slice(0, 10)
    } else continue

    const dateObj = new Date(dateStr)
    if (isNaN(dateObj.getTime())) continue

    const sales     = parseNumber(row[idx.sales])
    const company   = idx.company   !== -1 ? String(row[idx.company]   || '').trim() : ''
    const tradeName = idx.tradeName !== -1 ? String(row[idx.tradeName] || '').trim() : ''
    const category  = String(row[idx.category] || '(미분류)').trim()
    const manager   = idx.manager   !== -1 ? String(row[idx.manager]   || '').trim() : ''

    if (sales === 0 && !company && !tradeName) continue

    results.push({
      date: dateStr,
      year: dateObj.getFullYear(),
      month: dateObj.getMonth() + 1,
      day: dateObj.getDate(),
      week: getKoreanWeek(dateStr),
      category: category || '(미분류)',
      manager, company,
      trade_name: tradeName,
      sales, purchase: 0,
      profit: sales,
      source: 'live',
    })
  }
  return results
}

export async function GET() {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const [listRes, incomeRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '리스트!A:S' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '귀속 입금건!A:L' }),
    ])

    const listRows = (listRes.data.values || []).map(r => r.map(String))
    const incomeRows = (incomeRes.data.values || []).map(r => r.map(String))

    const listData = parseListTab(listRows)
    const incomeData = parseIncomeTab(incomeRows)
    const transactions = [...listData, ...incomeData]

    return NextResponse.json({ transactions, count: transactions.length })
  } catch (err) {
    console.error('Sheets API 오류:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
