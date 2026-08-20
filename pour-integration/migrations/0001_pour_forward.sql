-- ============================================================================
-- POUR 공사실적 — 순방향 마이그레이션 (0001)
--
-- 원칙: 지우지 않는다.
--   · DROP TABLE / DROP COLUMN / DELETE / TRUNCATE 를 쓰지 않는다
--   · 기존 열 이름과 자료형을 바꾸지 않는다
--   · 새 열은 전부 NULL 허용으로 추가한다 (기존 행은 그대로 NULL 이 된다)
--   · 여러 번 실행해도 같은 결과가 되도록 IF NOT EXISTS 를 쓴다
--
-- 주의: SQLite(D1)는 ALTER TABLE ... ADD COLUMN IF NOT EXISTS 를 지원하지 않는다.
--       아래 ALTER 문은 migrate.js 의 addColumnIfMissing() 을 통해 실행하거나,
--       PRAGMA table_info 로 확인한 뒤 없는 것만 실행해야 한다.
-- ============================================================================

-- ----------------------------------------------------------------- 특허 자료
-- 업로드한 POUR 특허 관리 엑셀을 담는다. 특허번호는 숫자만 남긴 값을 키로 쓴다.
CREATE TABLE IF NOT EXISTS pour_patents (
  number        TEXT PRIMARY KEY,          -- 정규화된 특허번호 (예: 1935719)
  display       TEXT,                      -- 표시용 (예: 제10-1935719호)
  name          TEXT,                      -- 특허명·공법명
  categories    TEXT,                      -- 공종 목록 (줄바꿈으로 구분)
  company       TEXT,                      -- 특허권자
  prefix        TEXT,                      -- 탭 앞에 붙일 구분 (예: DO)
  remark        TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT,
  updated_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_pour_patents_name ON pour_patents (name);

-- ------------------------------------------------- 현장별 특허 (POUR / 타사)
-- 한 현장에 특허를 여러 개 붙일 수 있고, POUR 와 타사를 kind 로 구분한다.
CREATE TABLE IF NOT EXISTS pour_project_patents (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,             -- 공고·실적 행의 고유 ID
  kind          TEXT NOT NULL,             -- 'POUR' | 'THIRD_PARTY'
  number        TEXT NOT NULL,             -- 정규화된 특허번호
  display       TEXT,
  name          TEXT,
  method        TEXT,
  company       TEXT,                      -- 타사 특허 보유 회사
  category      TEXT,
  remark        TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT,
  updated_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ppp_project ON pour_project_patents (project_id);
CREATE INDEX IF NOT EXISTS idx_ppp_number  ON pour_project_patents (kind, number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppp_project_kind_number
  ON pour_project_patents (project_id, kind, number);

-- ------------------------------------------------------------------ 수정 이력
CREATE TABLE IF NOT EXISTS pour_project_history (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  changed_at    TEXT NOT NULL,
  action        TEXT,                      -- '자료 수정' | '낙찰 처리' | 'POUR 적용 특허번호 추가' ...
  status_before TEXT,
  status_after  TEXT,
  changes_json  TEXT,                      -- [{field,label,before,after}, ...]
  created_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_pph_project ON pour_project_history (project_id, changed_at);

-- ------------------------------------------- 기존 공고·실적 표에 열 추가
-- 아래 문장은 '없을 때만' 실행해야 한다 (migrate.js 참고).
-- 기존 열(expected_amount 등)은 건드리지 않고 그대로 둔다.
--
-- ALTER TABLE projects ADD COLUMN document_due_date        TEXT;
-- ALTER TABLE projects ADD COLUMN bid_type                 TEXT;
-- ALTER TABLE projects ADD COLUMN bid_type_raw             TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_phone         TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_contact_name  TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_mobile        TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_address       TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_business_no   TEXT;
-- ALTER TABLE projects ADD COLUMN contractor_note          TEXT;
-- ALTER TABLE projects ADD COLUMN notice_patent_text       TEXT;
-- ALTER TABLE projects ADD COLUMN notice_multi_flag        INTEGER DEFAULT 0;
-- ALTER TABLE projects ADD COLUMN patent_confirmed         INTEGER DEFAULT 0;
-- ALTER TABLE projects ADD COLUMN scopes                   TEXT;
-- ALTER TABLE projects ADD COLUMN quality                  TEXT;
-- ALTER TABLE projects ADD COLUMN is_rebid                 INTEGER DEFAULT 0;
-- ALTER TABLE projects ADD COLUMN rebid_round              INTEGER;
-- ALTER TABLE projects ADD COLUMN rebid_reason             TEXT;
-- ALTER TABLE projects ADD COLUMN previous_fail_date       TEXT;
-- ALTER TABLE projects ADD COLUMN original_project_id      TEXT;
-- ALTER TABLE projects ADD COLUMN previous_project_id      TEXT;
-- ALTER TABLE projects ADD COLUMN result_entered_at        TEXT;
-- ALTER TABLE projects ADD COLUMN updated_at               TEXT;
