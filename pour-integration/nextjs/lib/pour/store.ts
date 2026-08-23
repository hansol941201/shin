/**
 * D1 접근 계층 — 읽기·저장(upsert)
 *
 * 원칙
 *  1. 지우지 않는다. 요청에 없는 projects 행은 그대로 둔다.
 *  2. id 기준 upsert. 있으면 UPDATE, 없으면 INSERT.
 *  3. patentItems 가 빈 배열이면 "특허를 모두 지웠다"는 뜻이다.
 *     그 현장의 특허 행만 지우고, 이전 번호를 되살리지 않는다.
 */
import PourRecords from "./core/pour-records.js";
import type { PourRecord, PatentRecord } from "./core";
import {
  COLUMN_MAP, projectRowToRecord, recordToProjectRow,
  recordToPatentRows, recordToHistoryRows,
  type ProjectRow, type PatentRow, type HistoryRow
} from "./mapping";

/** Cloudflare D1 바인딩에서 필요한 부분만 */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  };
  batch?(statements: unknown[]): Promise<unknown>;
}

export interface StoreOptions {
  projectsTable?: string;
}

const PROJECTS = (options?: StoreOptions) => options?.projectsTable || "projects";

/* --------------------------------------------------------------- 읽기 */

export async function listRecords(db: D1Like, options?: StoreOptions): Promise<PourRecord[]> {
  const table = PROJECTS(options);
  const rows = (await db.prepare(`SELECT * FROM ${table}`).all<ProjectRow>()).results || [];
  const patents = (await db
    .prepare("SELECT * FROM pour_project_patents ORDER BY project_id, sort_order")
    .all<PatentRow>()).results || [];
  const history = (await db
    .prepare("SELECT * FROM pour_project_history ORDER BY project_id, changed_at")
    .all<HistoryRow>()).results || [];

  const patentsBy = new Map<string, PatentRow[]>();
  patents.forEach((p) => {
    const list = patentsBy.get(p.project_id) || [];
    list.push(p);
    patentsBy.set(p.project_id, list);
  });
  const historyBy = new Map<string, HistoryRow[]>();
  history.forEach((h) => {
    const list = historyBy.get(h.project_id) || [];
    list.push(h);
    historyBy.set(h.project_id, list);
  });

  return rows.map((row) => {
    const id = String(row[COLUMN_MAP.id]);
    const draft = projectRowToRecord(row, patentsBy.get(id) || [], historyBy.get(id) || []);
    const record = PourRecords.normalize(draft) as PourRecord & { __extra?: ProjectRow };
    record.__extra = draft.__extra;      // 모르는 열을 그대로 들고 다닌다
    return record;
  });
}

/** 공법이 정해지면 소속은 따라온다. pour-patents.js 의 AFFILIATION_BY_TYPE 과 같아야 한다. */
function affiliationForType(type: string): string {
  if (type === "POUR" || type === "DO" || type === "CNC") return "자사계열";
  if (type === "타사" || type === "타사공법") return "타사";
  return "미분류";
}

export async function listPatents(db: D1Like): Promise<PatentRecord[]> {
  const rows = (await db.prepare("SELECT * FROM pour_patents WHERE active = 1").all<Record<string, unknown>>()).results || [];
  return rows.map((row) => {
    const categories = String(row.categories || "").split("\n").map((s) => s.trim()).filter(Boolean);
    return {
      number: String(row.number || ""),
      name: String(row.name || ""),
      categories,
      category: categories.join(", "),
      company: String(row.company || ""),
      prefix: String(row.prefix || ""),
      remark: String(row.remark || ""),
      active: row.active !== 0,
      // 구분이 비어 있는 옛 자료는 POUR 로 본다 (이 표는 지금까지 POUR 특허 목록이었다).
      // 0008 까지 쓰던 "타사" 는 공법 이름이 아니라 소속이었으므로 "타사공법" 으로 옮긴다.
      // 저장된 값을 UPDATE 로 고치지 않고 읽을 때만 옮긴다.
      patentType: (String(row.patent_type || "") === "타사"
        ? "타사공법" : String(row.patent_type || "")) || "POUR",
      affiliationType: String(row.affiliation_type || "")
        || affiliationForType(String(row.patent_type || "") || "POUR"),
      methodName: String(row.method_name || ""),
      firstSeenAt: String(row.first_seen_at || ""),
      lastSeenAt: String(row.last_seen_at || "")
    };
  });
}

/* ------------------------------------------------------------- 저장 */

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 열 이름과 값으로 INSERT ... ON CONFLICT DO UPDATE 문을 만든다. */
function upsertSql(table: string, row: ProjectRow, conflictKey: string) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((c) => c !== conflictKey)
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})
          ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}`,
    values: columns.map((c) => row[c] as unknown)
  };
}

export interface SaveResult {
  inserted: number;
  updated: number;
  patentRows: number;
  clearedPatentProjects: string[];
}

/**
 * 공고·실적을 저장한다. 요청에 없는 행은 건드리지 않는다.
 */
export async function upsertRecords(
  db: D1Like,
  records: PourRecord[],
  options?: StoreOptions
): Promise<SaveResult> {
  const table = PROJECTS(options);
  const result: SaveResult = { inserted: 0, updated: 0, patentRows: 0, clearedPatentProjects: [] };
  if (!records.length) return result;

  // 실제로 있는 열만 쓴다 (스키마에 없는 열을 넣으면 오류가 난다)
  const info = (await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results || [];
  const columns = new Set(info.map((c) => c.name));

  for (const raw of records) {
    const record = PourRecords.normalize(raw) as PourRecord & { __extra?: ProjectRow };
    record.__extra = (raw as PourRecord & { __extra?: ProjectRow }).__extra;
    if (!record.id) continue;

    const exists = await db
      .prepare(`SELECT ${COLUMN_MAP.id} AS id FROM ${table} WHERE ${COLUMN_MAP.id} = ?`)
      .bind(record.id)
      .first<{ id: string }>();

    const full = recordToProjectRow(record);
    const row: ProjectRow = {};
    Object.keys(full).forEach((key) => {
      if (columns.has(key)) row[key] = full[key];
    });
    if (columns.has(COLUMN_MAP.updatedAt)) row[COLUMN_MAP.updatedAt] = nowStamp();
    if (!exists && columns.has(COLUMN_MAP.createdAt) && !row[COLUMN_MAP.createdAt]) {
      row[COLUMN_MAP.createdAt] = nowStamp();
    }
    if (exists) delete row[COLUMN_MAP.createdAt];   // 최초 등록일은 바꾸지 않는다

    const { sql, values } = upsertSql(table, row, COLUMN_MAP.id);
    await db.prepare(sql).bind(...values).run();
    if (exists) result.updated++; else result.inserted++;

    // ---- 특허 항목 -------------------------------------------------
    // 빈 배열이면 "모두 지움"이다. 이전 번호를 되살리지 않는다.
    await db.prepare("DELETE FROM pour_project_patents WHERE project_id = ?")
      .bind(record.id).run();
    const patentRows = recordToPatentRows(record);
    if (!patentRows.length) result.clearedPatentProjects.push(record.id);
    for (const p of patentRows) {
      await db.prepare(
        `INSERT INTO pour_project_patents
           (id, project_id, kind, number, display, name, method, company, category, remark,
            sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind, number = excluded.number, display = excluded.display,
           name = excluded.name, method = excluded.method, company = excluded.company,
           category = excluded.category, remark = excluded.remark,
           sort_order = excluded.sort_order, updated_at = excluded.updated_at`
      ).bind(
        p.id, p.project_id, p.kind, p.number, p.display, p.name, p.method, p.company,
        p.category, p.remark, p.sort_order, p.created_at, p.updated_at
      ).run();
      result.patentRows++;
    }

    // ---- 수정 이력 (덧붙이기만) --------------------------------------
    for (const h of recordToHistoryRows(record)) {
      await db.prepare(
        `INSERT INTO pour_project_history
           (id, project_id, changed_at, action, status_before, status_after, changes_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      ).bind(
        h.id, h.project_id, h.changed_at, h.action, h.status_before, h.status_after,
        h.changes_json, nowStamp()
      ).run();
    }
  }

  return result;
}

export interface PatentSaveResult {
  inserted: number;
  updated: number;
}

/** POUR 특허 자료를 저장한다. 번호 기준 upsert 이며 기존 특허를 지우지 않는다. */
export async function upsertPatents(db: D1Like, patents: PatentRecord[]): Promise<PatentSaveResult> {
  const result: PatentSaveResult = { inserted: 0, updated: 0 };
  for (const patent of patents) {
    const number = String(patent.number || "").trim();
    if (!number) continue;
    const exists = await db.prepare(
      "SELECT number, patent_type, method_name, first_seen_at, last_seen_at, affiliation_type "
      + "FROM pour_patents WHERE number = ?")
      .bind(number).first<{
        number: string; patent_type: string | null; method_name: string | null;
        first_seen_at: string | null; last_seen_at: string | null;
        affiliation_type: string | null;
      }>();
    const categories = (patent.categories && patent.categories.length
      ? patent.categories
      : String(patent.category || "").split(",").map((s) => s.trim()).filter(Boolean)).join("\n");

    await db.prepare(
      `INSERT INTO pour_patents
         (number, display, name, categories, company, prefix, remark, active, created_at, updated_at,
          patent_type, method_name, first_seen_at, last_seen_at, affiliation_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(number) DO UPDATE SET
         display = excluded.display, name = excluded.name, categories = excluded.categories,
         company = excluded.company, prefix = excluded.prefix, remark = excluded.remark,
         active = excluded.active, updated_at = excluded.updated_at,
         patent_type = excluded.patent_type, method_name = excluded.method_name,
         first_seen_at = excluded.first_seen_at, last_seen_at = excluded.last_seen_at,
         affiliation_type = excluded.affiliation_type`
    ).bind(
      number,
      `제10-${number}호`,
      patent.name || "",
      categories,
      patent.company || "",
      patent.prefix || "",
      patent.remark || "",
      patent.active === false ? 0 : 1,
      nowStamp(),
      nowStamp(),
      // 이미 있던 구분·확인일은 지우지 않는다 (넘어온 값이 있을 때만 바꾼다)
      patent.patentType || exists?.patent_type || "POUR",
      patent.methodName || exists?.method_name || "",
      patent.firstSeenAt || exists?.first_seen_at || "",
      patent.lastSeenAt || exists?.last_seen_at || "",
      // 소속은 공법에서 따라온다. 넘어온 값도 없고 저장된 값도 없으면 공법으로 정한다.
      patent.affiliationType || exists?.affiliation_type
        || affiliationForType(patent.patentType || exists?.patent_type || "POUR")
    ).run();

    if (exists) result.updated++; else result.inserted++;
  }
  return result;
}
