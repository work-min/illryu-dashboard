type Item = { name: string; amount: number }

function b64url(value: string) {
  return Buffer.from(value).toString('base64url')
}

async function getAccessToken(): Promise<string> {
  const encoded = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim()
  if (!encoded) throw new Error('Google 서비스 계정 설정이 없습니다.')

  const sa = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Google 서비스 계정 설정이 올바르지 않습니다.')
  }

  const pemBody = String(sa.private_key)
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .replace(/\s/g, '')
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(pemBody, 'base64'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const sigInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    Buffer.from(sigInput)
  )
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${sigInput}.${Buffer.from(signature).toString('base64url')}`,
    }),
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) {
    throw new Error(`Google 인증 토큰 발급 실패 (HTTP ${response.status})`)
  }
  return data.access_token
}

function cell(rows: string[][], rowIdx: number, colIdx: number): string {
  return rows[rowIdx]?.[colIdx]?.trim() ?? ''
}

function parseNumber(value: string | undefined): number {
  if (!value || value.trim() === '') return 0
  const parsed = Number.parseFloat(value.replace(/[,%\s"]/g, ''))
  return Number.isNaN(parsed) ? 0 : parsed
}

function isTotalLabel(value: string): boolean {
  return ['미수금', '미지급금', '미수', '미지급'].includes(value.replace(/\s+/g, '').trim())
}

function parseReceivables(rows: string[][]): Item[] {
  const items: Item[] = []
  for (let i = 2; i < rows.length; i++) {
    const name = cell(rows, i, 1)
    const amount = parseNumber(cell(rows, i, 6))
    if (!name || amount === 0 || isTotalLabel(name)) continue
    items.push({ name, amount })
  }
  return items
}

function parsePayables(rows: string[][]): Item[] {
  const items: Item[] = []
  for (let i = 2; i < rows.length; i++) {
    const name = cell(rows, i, 10)
    const amount = parseNumber(cell(rows, i, 14))
    if (!name || amount === 0 || isTotalLabel(name)) continue
    items.push({ name, amount })
  }
  return items
}

export async function loadDailyReportItems(spreadsheetId: string) {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent('미수현황!A:AF')}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await response.json()

  if (!response.ok) {
    const message = response.status === 403 || response.status === 404
      ? '시트에 접근할 수 없습니다. 서비스 계정에 뷰어 권한이 있는지 확인해주세요.'
      : `Google Sheets 조회 실패 (HTTP ${response.status})`
    throw new Error(message)
  }

  const rows = Array.isArray(data.values)
    ? data.values.map((row: unknown[]) => row.map(String))
    : []
  return {
    receivables: parseReceivables(rows),
    payables: parsePayables(rows),
  }
}
