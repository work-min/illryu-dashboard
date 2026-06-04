import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET: 특정 월 정산 데이터 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  if (!year || !month) return NextResponse.json({ error: 'year/month 필요' }, { status: 400 })

  const { data, error } = await supabase
    .from('settlement_records')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}

// POST: 정산 데이터 저장 (upsert — 같은 year/month면 업데이트)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { year, month, operating_profit, total_payroll, total_expenses,
    fixed_expenses, variable_expenses, final_profit, employees } = body

  if (!year || !month) return NextResponse.json({ error: 'year/month 필요' }, { status: 400 })

  const { data, error } = await supabase
    .from('settlement_records')
    .upsert(
      { year, month, operating_profit, total_payroll, total_expenses,
        fixed_expenses, variable_expenses, final_profit, employees },
      { onConflict: 'year,month' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}

// PATCH: 저장된 정산 데이터 수정 (급여/지출 변경)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { year, month, ...updates } = body
  if (!year || !month) return NextResponse.json({ error: 'year/month 필요' }, { status: 400 })

  // 최종 이익 자동 재계산
  if (updates.total_payroll !== undefined || updates.total_expenses !== undefined) {
    const { data: existing } = await supabase
      .from('settlement_records')
      .select('operating_profit, total_payroll, total_expenses')
      .eq('year', year).eq('month', month).maybeSingle()

    if (existing) {
      const op = existing.operating_profit
      const tp = updates.total_payroll ?? existing.total_payroll
      const te = updates.total_expenses ?? existing.total_expenses
      updates.final_profit = op - tp - te
    }
  }

  const { data, error } = await supabase
    .from('settlement_records')
    .update(updates)
    .eq('year', year).eq('month', month)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}
