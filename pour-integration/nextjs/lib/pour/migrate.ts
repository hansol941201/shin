/**
 * POUR 통합 순방향 마이그레이션 (실행 시점 · 몇 번을 실행해도 안전)
 *
 * Sites 배포에서 D1 바인딩(`DB`)을 그대로 넘겨 부르면 됩니다.
 *
 *   import { migratePourSchema } from "@/lib/pour/migrate";
 *   const result = await migratePourSchema(env.DB);
 *
 * 원칙
 *   · 없는 것만 더한다. 있는 열·표·행은 건드리지 않는다
 *   · DROP / DELETE / TRUNCATE / 표 교체를 쓰지 않는다
 *   · 두 번 실행해도 아무 일도 일어나지 않는다 (더할 것이 없으므로)
 */
import type { D1Like } from "./store";

/** projects 에 더할 열. 이미 있으면 건너뛴다. */
export const PROJECT_COLUMNS: ReadonlyArray<readonly [string, string]> = [
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
  ["updated_at", "TEXT"],
  ["patents_migrated", "INTEGER DEFAULT 0"],
  /** 연도별 실적 List 에서 옮겨 온 연도. 원본에 날짜가 없어 연도만 담는다. */
  ["record_year", "TEXT"],
  /** 공종의 대분류+세부 짝. 기존 공종 열(category)은 그대로 두고 옆에 더한다. */
  ["category_items", "TEXT"],
  /** 어디서 들어온 자료인지 ("import" = 연도별 실적 List 이전분). 알림 대상을 가르는 데만 쓴다. */
  ["record_source", "TEXT"],
  /** 원본 위치 ("2025년 348행"). 엑셀 어느 줄에서 왔는지 되짚기 위해 남긴다. */
  ["source_ref", "TEXT"],
  /** 겹치는 줄이면 먼저 나온 줄의 id. 지우지 않고 표시만 한다. */
  ["duplicate_of", "TEXT"],
  /** K-APT 공고번호. 공고 단계에서 확인되는 값이라 같은 뜻의 기존 열이 없다. */
  ["notice_no", "TEXT"],
  /** 협약사 여부 ("예"/"아니오"/빈 값). 협약서 발행번호(agreement_no)와는 뜻이 다르다. */
  ["is_partner", "TEXT"]
] as const;

/**
 * 특허 마스터(pour_patents)에 더할 열. 이미 있으면 건너뛴다.
 * 표를 새로 만들 때는 CREATE 문에 이미 들어 있고, 옛 표에는 여기서 더해진다.
 */
export const PATENT_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  /** 개별 특허 한 건의 구분 ("POUR" / "타사" / "미분류"). 현장 전체 구분과는 다르다. */
  ["patent_type", "TEXT"],
  /** 공법명. 특허명(name)과 따로 둔다. */
  ["method_name", "TEXT"],
  /** 이 번호를 현장에서 처음 본 날 */
  ["first_seen_at", "TEXT"],
  /** 마지막으로 본 날 */
  ["last_seen_at", "TEXT"]
] as const;

/** 새로 만드는 표와 색인. 전부 IF NOT EXISTS 라 기존 것을 덮지 않는다. */
const CREATE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS pour_patents (
     number TEXT PRIMARY KEY, display TEXT, name TEXT, categories TEXT,
     company TEXT, prefix TEXT, remark TEXT,
     active INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT,
     patent_type TEXT, method_name TEXT, first_seen_at TEXT, last_seen_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_pour_patents_name ON pour_patents (name)`,
  `CREATE TABLE IF NOT EXISTS pour_project_patents (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
     display TEXT, name TEXT, method TEXT, company TEXT, category TEXT, remark TEXT,
     sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_ppp_project ON pour_project_patents (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ppp_number ON pour_project_patents (kind, number)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_ppp_project_kind_number
     ON pour_project_patents (project_id, kind, number)`,
  `CREATE TABLE IF NOT EXISTS pour_project_history (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, changed_at TEXT NOT NULL,
     action TEXT, status_before TEXT, status_after TEXT, changes_json TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_pph_project ON pour_project_history (project_id, changed_at)`
];

export interface MigrateResult {
  /** 이번에 더한 열 이름 */
  addedColumns: string[];
  /** 이미 있어서 건너뛴 열 이름 */
  existingColumns: string[];
  /** 만들었거나 이미 있던 표 */
  tables: string[];
  /** projects 행 수 — 마이그레이션 전후가 같아야 한다 */
  projectRows: number;
}

export interface MigrateOptions {
  projectsTable?: string;
}

export async function migratePourSchema(
  db: D1Like,
  options?: MigrateOptions
): Promise<MigrateResult> {
  const table = options?.projectsTable || "projects";

  const before = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>();

  for (const sql of CREATE_STATEMENTS) {
    await db.prepare(sql).run();
  }

  const info = (await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results || [];
  const have = new Set(info.map((c) => c.name));

  const addedColumns: string[] = [];
  const existingColumns: string[] = [];
  for (const [name, type] of PROJECT_COLUMNS) {
    if (have.has(name)) { existingColumns.push(name); continue; }
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
    addedColumns.push(name);
  }

  // 특허 마스터에도 없는 열만 더한다 (옛 표를 쓰던 곳을 위해)
  const patentInfo = (await db.prepare("PRAGMA table_info(pour_patents)")
    .all<{ name: string }>()).results || [];
  const havePatent = new Set(patentInfo.map((c) => c.name));
  for (const [name, type] of PATENT_COLUMNS) {
    if (havePatent.has(name)) { existingColumns.push(name); continue; }
    await db.prepare(`ALTER TABLE pour_patents ADD COLUMN ${name} ${type}`).run();
    addedColumns.push(name);
  }

  // 색인은 열을 다 더한 뒤에 만든다. 옛 표에는 patent_type 이 아직 없어
  // 먼저 만들려 하면 "no such column" 으로 마이그레이션이 통째로 멈춘다.
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pour_patents_type ON pour_patents (patent_type)").run();

  const after = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>();
  if (before && after && before.c !== after.c) {
    throw new Error(`행 수가 달라졌습니다: ${before.c} → ${after.c}`);
  }

  return {
    addedColumns,
    existingColumns,
    tables: ["pour_patents", "pour_project_patents", "pour_project_history"],
    projectRows: after ? after.c : 0
  };
}
