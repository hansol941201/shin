/**
 * D1 순방향 마이그레이션 실행기
 *
 * 기존 자료를 지우지 않는다. 없는 표와 없는 열만 새로 만든다.
 * Cloudflare Worker 안에서 D1 바인딩을 넘겨 부른다.
 *
 *   import { migrate } from "./migrations/migrate.js";
 *   const result = await migrate(env.DB, { projectsTable: "projects" });
 *
 * 되돌리기가 필요하면 추가된 열은 그대로 두고 값만 쓰지 않으면 된다.
 * (열을 지우면 기존 자료가 함께 사라지므로 되돌리기에서도 DROP 은 하지 않는다.)
 */

const NEW_COLUMNS = [
  ["document_due_date", "TEXT"],
  ["bid_type", "TEXT"],
  ["bid_type_raw", "TEXT"],
  ["contractor_phone", "TEXT"],
  ["contractor_contact_name", "TEXT"],
  ["contractor_mobile", "TEXT"],
  ["contractor_address", "TEXT"],
  ["contractor_business_no", "TEXT"],
  ["contractor_note", "TEXT"],
  ["notice_patent_text", "TEXT"],
  ["notice_multi_flag", "INTEGER DEFAULT 0"],
  ["patent_confirmed", "INTEGER DEFAULT 0"],
  ["scopes", "TEXT"],
  ["quality", "TEXT"],
  ["is_rebid", "INTEGER DEFAULT 0"],
  ["rebid_round", "INTEGER"],
  ["rebid_reason", "TEXT"],
  ["previous_fail_date", "TEXT"],
  ["original_project_id", "TEXT"],
  ["previous_project_id", "TEXT"],
  ["result_entered_at", "TEXT"],
  ["updated_at", "TEXT"]
];

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS pour_patents (
     number TEXT PRIMARY KEY, display TEXT, name TEXT, categories TEXT,
     company TEXT, prefix TEXT, remark TEXT,
     active INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_pour_patents_name ON pour_patents (name)`,
  `CREATE TABLE IF NOT EXISTS pour_project_patents (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
     number TEXT NOT NULL, display TEXT, name TEXT, method TEXT, company TEXT,
     category TEXT, remark TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
     created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_ppp_project ON pour_project_patents (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ppp_number ON pour_project_patents (kind, number)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_ppp_project_kind_number
     ON pour_project_patents (project_id, kind, number)`,
  `CREATE TABLE IF NOT EXISTS pour_project_history (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, changed_at TEXT NOT NULL,
     action TEXT, status_before TEXT, status_after TEXT, changes_json TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_pph_project ON pour_project_history (project_id, changed_at)`
];

/** 표가 실제로 있는지 확인한다. */
export async function tableExists(db, name) {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(name)
    .first();
  return !!row;
}

/** 이미 있는 열은 건너뛴다. */
export async function addColumnIfMissing(db, table, column, type) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all();
  const has = (info.results || []).some((c) => c.name === column);
  if (has) return { column, added: false };
  await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  return { column, added: true };
}

export async function migrate(db, options = {}) {
  const projectsTable = options.projectsTable || "projects";
  const created = [];
  const added = [];
  const skipped = [];

  for (const sql of CREATE_STATEMENTS) {
    await db.prepare(sql).run();
    const match = sql.match(/(?:TABLE|INDEX) IF NOT EXISTS (\w+)/);
    if (match) created.push(match[1]);
  }

  if (await tableExists(db, projectsTable)) {
    for (const [column, type] of NEW_COLUMNS) {
      const result = await addColumnIfMissing(db, projectsTable, column, type);
      (result.added ? added : skipped).push(column);
    }
  } else {
    skipped.push(`${projectsTable} 표를 찾지 못해 열 추가를 건너뜀`);
  }

  // 기존 행 수를 세어 자료가 그대로인지 확인한다 (지우거나 바꾸지 않는다)
  let projectCount = null;
  if (await tableExists(db, projectsTable)) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${projectsTable}`).first();
    projectCount = row ? row.n : null;
  }

  return { created, added, skipped, projectCount };
}

export default migrate;
