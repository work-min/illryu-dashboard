import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { loadDailyReportItems } from '@/lib/daily-report-sheets'

const SPREADSHEET_ID = '1EIhahq4aNB5Lik9mp9owDi509S01XWg7HBdE2lUgHh4'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    return NextResponse.json({ error: '로그인 세션이 만료되었습니다.' }, { status: 401 })
  }

  try {
    return NextResponse.json(await loadDailyReportItems(SPREADSHEET_ID))
  } catch (err) {
    console.error('daily-report/j2lab/sheets 오류:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '시트 조회에 실패했습니다.' },
      { status: 500 }
    )
  }
}
