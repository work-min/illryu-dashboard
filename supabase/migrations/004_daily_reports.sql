-- 일마감 보고 저장 테이블
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date UNIQUE NOT NULL,
  transfers jsonb NOT NULL DEFAULT '[]'::jsonb,
  receivables jsonb NOT NULL DEFAULT '[]'::jsonb,
  payables jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON daily_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_daily_reports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE FUNCTION set_daily_reports_updated_at();
