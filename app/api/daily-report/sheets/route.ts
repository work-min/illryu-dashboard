import { NextResponse } from 'next/server'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

function b64url(s: string) { return Buffer.from(s).toString('base64url') }

async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(Buffer.from((process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim(), 'base64').toString('utf-8'))
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '').replace(/\n/g, '').replace(/\r/g, '').replace(/\s/g, '')
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', Buffer.from(pemBody, 'base64'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }))
  const sigInput = `${header}.${payload}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, Buffer.from(sigInput))
  const jwt = `${sigInput}.${Buffer.from(sig).toString('base64url')}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
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

function num(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  const n = parseFloat(val.replace(/[,\s"]/g, ''))
  return isNaN(n) ? 0 : n
}

// 셀 값 안전하게 읽기
function cell(rows: string[][], rowIdx: number, colIdx: number): string {
  return rows[rowIdx]?.[colIdx]?.trim() ?? ''
}

export async function GET() {
  try {
    const token = await getAccessToken()
    // A~AF 열만 읽음 (필요한 최대 열: AF = 31번째)
    const rows = await fetchSheet(token, '미수현황!A:AF')

    const receivables: { name: string; amount: number }[] = []
    const payables: { name: string; amount: number }[] = []

    // ────────────────────────────────────────────
    // 미수 추출
    // ────────────────────────────────────────────

    // 영역 1: B열(1) 업체명 / G열(6) 금액 — 3행부터 (index 2+)
    for (let i = 2; i < rows.length; i++) {
      const name = cell(rows, i, 1)   // B열
      const amount = num(cell(rows, i, 6))  // G열
      if (name && amount !== 0) receivables.push({ name, amount })
    }

    // 영역 2: M1(rows[0][12]) 업체명 / N1(rows[0][13]) 금액
    {
      const name = cell(rows, 0, 12)   // M1
      const amount = num(cell(rows, 0, 13)) // N1
      if (name && amount !== 0) receivables.push({ name, amount })
    }

    // 영역 3: S1(rows[0][18]) 업체명 / T1(rows[0][19]) 금액
    {
      const name = cell(rows, 0, 18)   // S1
      const amount = num(cell(rows, 0, 19)) // T1
      if (name && amount !== 0) receivables.push({ name, amount })
    }

    // ────────────────────────────────────────────
    // 미지급 추출
    // ────────────────────────────────────────────

    // 영역 1: W열(22) 업체명 / AA열(26) 금액 — 3행부터 (index 2+)
    for (let i = 2; i < rows.length; i++) {
      const name = cell(rows, i, 22)   // W열
      const amount = num(cell(rows, i, 26)) // AA열
      if (name && amount !== 0) payables.push({ name, amount })
    }

    // 영역 2: AD2(rows[1][29]) 업체명 / AF1(rows[0][31]) 금액
    {
      const name = cell(rows, 1, 29)   // AD2
      const amount = num(cell(rows, 0, 31)) // AF1
      if (name && amount !== 0) payables.push({ name, amount })
    }

    return NextResponse.json({ receivables, payables })
  } catch (err) {
    console.error('daily-report/sheets 오류:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
