-- ============================================================================
-- 0002_pour_integration.sql
-- POUR 특허·다특허·재공고·시공사 정보 통합 (순방향)
--
-- 0000_hansol_performance.sql, 0001_workflow_automation.sql 다음에 실행합니다.
--
-- 원칙
--   · 기존 projects 표와 행을 지우거나 바꾸지 않습니다
--   · 새 열은 전부 NULL 허용이라 기존 행은 그대로 NULL 이 됩니다
--   · DROP / DELETE / TRUNCATE 를 쓰지 않습니다
--   · 여러 번 실행해도 안전합니다 (IF NOT EXISTS)
--
-- ⚠ SQLite(D1) 는 ALTER TABLE ... ADD COLUMN IF NOT EXISTS 가 없습니다.
--    이미 있는 열이면 오류가 나므로, drizzle-kit 으로 생성하거나
--    scripts/pour-migrate.mjs 로 실행하세요. (없는 열만 골라 추가합니다)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pour_patents (
  number      TEXT PRIMARY KEY,
  display     TEXT,
  name        TEXT,
  categories  TEXT,
  company     TEXT,
  prefix      TEXT,
  remark      TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_pour_patents_name ON pour_patents (name);

CREATE TABLE IF NOT EXISTS pour_project_patents (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  number      TEXT NOT NULL,
  display     TEXT,
  name        TEXT,
  method      TEXT,
  company     TEXT,
  category    TEXT,
  remark      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ppp_project ON pour_project_patents (project_id);
CREATE INDEX IF NOT EXISTS idx_ppp_number  ON pour_project_patents (kind, number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppp_project_kind_number
  ON pour_project_patents (project_id, kind, number);

CREATE TABLE IF NOT EXISTS pour_project_history (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  changed_at    TEXT NOT NULL,
  action        TEXT,
  status_before TEXT,
  status_after  TEXT,
  changes_json  TEXT,
  created_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_pph_project ON pour_project_history (project_id, changed_at);

-- projects 에 더할 열 (없는 것만 추가 — scripts/pour-migrate.mjs 가 처리)
-- ALTER TABLE projects ADD COLUMN document_due_date       TEXT;
-- ALTER TABLE projects ADD COLUMN bid_type                TEXT;
-- ALTER TABLE projects ADD COLUMN bid_type_raw            TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_phone        TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_contact_name TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_mobile       TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_address      TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_business_no  TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_note         TEXT;
-- ALTER TABLE projects ADD COLUMN notice_patent_text      TEXT;
-- ALTER TABLE projects ADD COLUMN notice_multi_flag       INTEGER DEFAULT 0;
-- ALTER TABLE projects ADD COLUMN patent_confirmed        INTEGER DEFAULT 0;
-- ALTER TABLE projects ADD COLUMN scopes                  TEXT;
-- ALTER TABLE projects ADD COLUMN quality                 TEXT;
-- ALTER TABLE projects ADD COLUMN is_rebid                INTEGER DEFAULT 0;
-- ALTER TABLE projects ADD COLUMN rebid_round             INTEGER;
-- ALTER TABLE projects ADD COLUMN rebid_reason            TEXT;
-- ALTER TABLE projects ADD COLUMN previous_fail_date      TEXT;
-- ALTER TABLE projects ADD COLUMN original_project_id     TEXT;
-- ALTER TABLE projects ADD COLUMN previous_project_id     TEXT;
-- ALTER TABLE projects ADD COLUMN result_entered_at       TEXT;
-- ALTER TABLE projects ADD COLUMN updated_at              TEXT;
-- ALTER TABLE projects ADD COLUMN patents_migrated        INTEGER DEFAULT 0;
-- ALTER TABLE projects ADD COLUMN record_year             TEXT;
