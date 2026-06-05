-- ============================================================
-- 일류기획 손익 대시보드 — 테이블 스키마
-- ============================================================

-- ─── profiles ───────────────────────────────────────────────
-- Supabase Auth 유저와 1:1 매핑. id = auth.users.id
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY,  -- auth.users.id 참조
  email      text        NOT NULL,
  name       text,
  role       text        DEFAULT 'viewer',  -- 'viewer' | 'admin'
  created_at timestamptz DEFAULT now()
);

-- ─── transactions ────────────────────────────────────────────
-- 매출/매입 거래 내역 (핵심 테이블)
CREATE TABLE IF NOT EXISTS public.transactions (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date    NOT NULL,
  year       integer NOT NULL,
  month      integer NOT NULL,
  day        integer NOT NULL,
  week       text,                          -- '1주차'~'5주차' (한국 월요일 기준)
  category   text    DEFAULT '(미분류)',    -- 접수형|관리형|보장형|테스트|보장 완료|중단건|오세팅건
  manager    text,
  company    text,                          -- 대행사명
  trade_name text,                          -- 상호명
  sales      bigint  DEFAULT 0,
  purchase   bigint  DEFAULT 0,
  profit     bigint  DEFAULT 0,             -- sales - purchase
  source     text    DEFAULT 'live',        -- 'live'|'archive'|'manual'
  is_closed  boolean DEFAULT false,         -- false=임시저장, true=마감확정
  closed_at  timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ─── close_history ───────────────────────────────────────────
-- 월 마감 실행 이력 기록
CREATE TABLE IF NOT EXISTS public.close_history (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  year          integer NOT NULL,
  month         integer NOT NULL,
  closed_at     timestamptz DEFAULT now(),
  total_count   integer     DEFAULT 0,
  total_sales   bigint      DEFAULT 0,
  total_purchase bigint     DEFAULT 0,
  total_profit  bigint      DEFAULT 0,
  memo          text,
  created_at    timestamptz DEFAULT now()
);

-- ─── snapshots ───────────────────────────────────────────────
-- 보고서 저장 스냅샷
CREATE TABLE IF NOT EXISTS public.snapshots (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  year       integer,
  month      integer,
  filters    jsonb,   -- 저장 시점의 필터 조건
  summary    jsonb,   -- KPI 등 집계 요약
  created_at timestamptz DEFAULT now()
);

-- ─── settlement_records ──────────────────────────────────────
-- 월별 정산 데이터 (급여 + 지출 + 최종 손익)
CREATE TABLE IF NOT EXISTS public.settlement_records (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  year              integer NOT NULL,
  month             integer NOT NULL,
  operating_profit  bigint  NOT NULL DEFAULT 0,  -- 손익 대시보드 기준 영업이익
  total_payroll     bigint  NOT NULL DEFAULT 0,  -- 총 급여 합계
  total_expenses    bigint  NOT NULL DEFAULT 0,  -- 총 지출 (고정+유동)
  fixed_expenses    bigint  NOT NULL DEFAULT 0,
  variable_expenses bigint  NOT NULL DEFAULT 0,
  final_profit      bigint  NOT NULL DEFAULT 0,  -- operating_profit - payroll - expenses
  employees         jsonb   NOT NULL DEFAULT '[]',  -- [{name, net, note}]
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  CONSTRAINT settlement_records_year_month_key UNIQUE (year, month)
);

-- ─── transaction_periods (VIEW) ──────────────────────────────
-- 드롭다운 년/월 목록용 (데이터가 존재하는 월만 표시)
CREATE OR REPLACE VIEW public.transaction_periods AS
  SELECT DISTINCT year, month
  FROM public.transactions
  ORDER BY year, month;
