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

function num(val: unknown): number {
  if (!val || String(val).trim() === '') return 0
  const n = parseFloat(String(val).replace(/[,\s"]/g, ''))
  return isNaN(n) ? 0 : n
}

function isUrl(s: string) { return s.startsWith('http') || s.startsWith('www.') }
function isNumOnly(s: string) { return s.length > 0 && !isNaN(Number(s.replace(/[,.\- ]/g, ''))) }

export async function GET() {
  try {
    const token = await getAccessToken()
    // 미수금합 탭 전체를 넓게 읽음 (A:BZ)
    const rows = await fetchSheet(token, '미수현황!A:BZ')

    if (rows.length < 3) {
      return NextResponse.json({ receivables: [], payables: [], debug: { rows } })
    }

    const row0 = rows[0]  // 대분류 섹션 헤더 행
    const row1 = rows[1]  // 컬럼 헤더 행

    // 미지급금합 섹션 시작 컬럼 인덱스 (이 기준으로 receivable / payable 구분)
    const paySecStart = row0.findIndex(c => String(c).includes('미지급금'))

    // 정산대기 컬럼 인덱스 목록 (미수금합 영역 한정)
    const rcvAmtCols: number[] = []
    row1.forEach((c, i) => {
      if (String(c).includes('정산대기') && (paySecStart < 0 || i < paySecStart)) {
        rcvAmtCols.push(i)
      }
    })

    // 지출예정 컬럼 인덱스 목록 (미지급금합 영역 한정)
    const payAmtCols: number[] = []
    row1.forEach((c, i) => {
      const h = String(c)
      if ((h.includes('지출 예정') || h.includes('지출예정')) && (paySecStart < 0 || i >= paySecStart)) {
        payAmtCols.push(i)
      }
    })

    const receivables: { name: string; amount: number }[] = []
    const payables: { name: string; amount: number }[] = []

    // 데이터 행 파싱
    for (const row of rows.slice(2)) {
      if (!row || row.every(c => !String(c).trim())) continue

      // 미수금: 회사명 = B열(index 1) 우선, 없으면 A열(index 0)
      if (rcvAmtCols.length > 0) {
        const name = String(row[1] || row[0] || '').trim()
        if (name && !isUrl(name) && !isNumOnly(name)) {
          for (const col of rcvAmtCols) {
            const amount = num(row[col])
            if (amount > 0) {
              receivables.push({ name, amount })
              break
            }
          }
        }
      }

      // 미지급금: 지출예정 컬럼 앞에서 마지막 텍스트 값을 항목명으로 사용
      for (const col of payAmtCols) {
        const amount = num(row[col])
        if (amount <= 0) continue

        let name = ''
        const from = paySecStart >= 0 ? paySecStart : 0
        for (let i = from; i < col; i++) {
          const v = String(row[i] || '').trim()
          if (!v || isUrl(v) || isNumOnly(v)) continue
          name = v  // 계속 갱신 → 가장 나중 텍스트(더 구체적 항목명)를 사용
        }
        if (!name) name = String(row[0] || '').trim()
        if (name && !isUrl(name)) payables.push({ name, amount })
      }
    }

    // row0 특수 섹션 누적 값 파싱 (퍼플페이백, 페이백 누적 등)
    // 미수금합·미지급금합·손익계산서·개인계좌 등 집계 섹션은 제외
    const SKIP = ['미수금합', '미지급금합', '미지급금', '손익계산서', '개인계좌', '이체']
    for (let i = 0; i < row0.length; i++) {
      const label = String(row0[i] || '').trim()
      if (!label || SKIP.some(s => label.includes(s))) continue

      // 인접 셀에서 첫 번째 양수 값 탐색
      for (let j = i + 1; j <= i + 6 && j < row0.length; j++) {
        if (!row0[j]) continue
        const val = num(row0[j])
        if (val > 0) {
          const alreadyAdded =
            receivables.some(r => r.name === label) ||
            payables.some(p => p.name === label)
          if (!alreadyAdded) {
            const item = { name: label, amount: val }
            if (paySecStart >= 0 && i >= paySecStart) payables.push(item)
            else receivables.push(item)
          }
          break
        }
      }
    }

    return NextResponse.json({
      receivables,
      payables,
      // 디버그 정보: 컬럼 탐지 결과 확인용
      debug: {
        row0: row0.slice(0, 60),
        row1: row1.slice(0, 60),
        rcvAmtCols,
        payAmtCols,
        paySecStart,
      },
    })
  } catch (err) {
    console.error('daily-report/sheets 오류:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
