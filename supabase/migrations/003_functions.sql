-- ============================================================
-- 일류기획 손익 대시보드 — 함수 및 트리거
-- ============================================================

-- ─── update_updated_at ───────────────────────────────────────
-- settlement_records.updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- settlement_records에 트리거 연결
CREATE TRIGGER trg_settlement_records_updated_at
  BEFORE UPDATE ON public.settlement_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── rls_auto_enable ─────────────────────────────────────────
-- public 스키마에 새 테이블 생성 시 RLS 자동 활성화 이벤트 트리거
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
      AND cmd.schema_name IN ('public')
      AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
      AND cmd.schema_name NOT LIKE 'pg_toast%'
      AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (system schema or not enforced)', cmd.object_identity;
    END IF;
  END LOOP;
END;
$$;

-- 이벤트 트리거 등록 (ddl_command_end 시점)
CREATE EVENT TRIGGER trg_rls_auto_enable
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();
