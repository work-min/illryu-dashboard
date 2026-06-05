-- ============================================================
-- 일류기획 손익 대시보드 — RLS (Row Level Security) 정책
-- ============================================================
-- 모든 테이블은 authenticated 유저만 접근 가능
-- ============================================================

-- ─── transactions ────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_select ON public.transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY authenticated_insert ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY authenticated_update ON public.transactions
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY authenticated_delete ON public.transactions
  FOR DELETE TO authenticated USING (true);

-- ─── snapshots ───────────────────────────────────────────────
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_all ON public.snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── settlement_records ──────────────────────────────────────
ALTER TABLE public.settlement_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_all ON public.settlement_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 본인 프로필만 조회/수정 가능
CREATE POLICY self_select ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY self_update ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- ─── close_history ───────────────────────────────────────────
ALTER TABLE public.close_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_all ON public.close_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
