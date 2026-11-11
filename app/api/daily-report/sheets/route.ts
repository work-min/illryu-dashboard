import { NextResponse } from 'next/server'
import { loadDailyReportItems } from '@/lib/daily-report-sheets'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

export async function GET() {
  try {
    return NextResponse.json(await loadDailyReportItems(SPREADSHEET_ID))
  } catch (err) {
    console.error('daily-report/sheets 오류:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
