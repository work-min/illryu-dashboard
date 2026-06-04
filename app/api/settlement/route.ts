import { NextResponse } from 'next/server'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

function b64url(str: string) {
  return Buffer.from(str).toString('base64url')
}

async function getAccessToken(): Promise<string> {
  const b64 = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim()
  const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '').replace(/\n/g, '').replace(/\r/g, '').replace(/\s/g, '').trim()
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
  const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, Buffer.from(sigInput))
  const jwt = `${sigInput}.${Buffer.from(sigBytes).toString('base64url')}`
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

function parseNumber(val: unknown): number {
  if (!val || String(val).trim() === '') return 0
  const num = parseFloat(String(val).replace(/[,\s"]/g, ''))
  return isNaN(num) ? 0 : num
}

export async function GET() {
  try {
    const token = await getAccessToken()
    const [payrollRows, expenseRows] = await Promise.all([
      fetchSheet(token, '급여(지급액)!A:J'),
      fetchSheet(token, '지출!A:Z'),
    ])

    // 급여 파싱: 이름 헤더 행 찾기
    const headerIdx = payrollRows.findIndex(r => r.some(c => c.includes('이름')))
    const employees = headerIdx === -1 ? [] : payrollRows.slice(headerIdx + 1)
      .filter(r => r[1] && r[1].trim() && r[1].trim() !== '')
      .map(r => ({
        name: r[1]?.trim() || '',
        gross: parseNumber(r[5]),       // 세전
        net: parseNumber(r[6]),          // 지급액(세후)
        extra: parseNumber(r[7]),        // 기타 지급(급여이체)
        cash: parseNumber(r[8]),         // 일반 이체(현금)
        note: r[9]?.trim() || '',        // 특이사항
      }))

    // 지출 파싱: 고정/유동 합계 행
    const fixedRow = expenseRows.find(r => r[1] === '고정')
    const fixed = parseNumber(fixedRow?.[6])
    const variable = parseNumber(fixedRow?.[22])

    return NextResponse.json({
      employees,
      expenses: { fixed, variable, total: fixed + variable },
    })
  } catch (err) {
    console.error('Settlement API 오류:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
