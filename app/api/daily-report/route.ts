import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/daily-report?date=2026-06-05
export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date 파라미터 필요' }, { status: 400 })

  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('date', date)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report: data })
}

// POST /api/daily-report — upsert (같은 날짜면 덮어씀)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, transfers, receivables, payables, notes } = body
  if (!date) return NextResponse.json({ error: 'date 필요' }, { status: 400 })

  const { data, error } = await supabase
    .from('daily_reports')
    .upsert(
      { date, transfers: transfers ?? [], receivables: receivables ?? [], payables: payables ?? [], notes: notes ?? '' },
      { onConflict: 'date' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report: data })
}
