/**
 * 운영 D1 에 넣기 전 예행연습.
 *   node pour-integration/scripts/dry-run-seed.mjs
 *   node pour-integration/scripts/dry-run-seed.mjs --db <운영에서 내려받은 .sqlite 사본>
 *
 * 하는 일
 *   1. 운영 projects 를 흉내 낸 사본(또는 넘겨준 사본)을 메모리에 올린다
 *   2. record_year 를 포함한 새 열을 더한다 (없는 열만)
 *   3. drizzle/seed-records.sql 을 두 번 실행한다
 *   4. 기존 자료 보존 · 겹침 없음 · 전화번호 문자열 · 날짜 미생성을 확인한다
 *
 * 운영 데이터베이스는 건드리지 않는다. 사본을 넘겨도 파일에 쓰지 않고 메모리로만 읽는다.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = join(HERE, "..", "nextjs", "drizzle", "seed-records.sql");

if (!existsSync(SEED)) {
  console.error("seed-records.sql 이 없습니다.");
  console.error("  python3 pour-integration/scripts/import-records.py <연도별 실적List.xlsx>");
  process.exit(1);
}
const seedSql = readFileSync(SEED, "utf8");

const at = process.argv.indexOf("--db");
const copyPath = at >= 0 ? process.argv[at + 1] : "";

/* 1. 사본 준비 ---------------------------------------------------------- */
let db;
if (copyPath) {
  // 파일을 읽어 메모리로만 올린다 (원본 파일에 쓰지 않는다)
  db = new Database(readFileSync(copyPath));
  console.log(`운영 사본 사용: ${copyPath}`);
} else {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, client TEXT, region TEXT, city TEXT,
      project_name TEXT, category TEXT, phone TEXT, households INTEGER,
      status TEXT, notice_date TEXT, bid_date TEXT, award_date TEXT,
      award_amount INTEGER, expected_amount INTEGER, contractor TEXT,
      patent_numbers TEXT, agreement_no TEXT, address TEXT, remark TEXT, created_at TEXT
    );
    INSERT INTO projects (id, client, region, city, project_name, phone, households,
                          status, notice_date, award_date, award_amount, expected_amount,
                          contractor, patent_numbers, remark, created_at) VALUES
      ('p-1','기존 운영 아파트 1','경기','하남','외벽 재도장공사','031-000-1111',500,
       '낙찰','2026-01-05','2026-02-05',1250000000,900000000,'코지건설','1935719','기존 자료','2026-01-01'),
      ('p-2','기존 운영 아파트 2','충남','금산','외벽 도장공사','041-222-3333',430,
       '공고','2026-02-01',NULL,NULL,500000000,NULL,NULL,'','2026-02-01');
  `);
  console.log("운영 사본을 주지 않아 흉내 낸 표로 예행연습합니다. (--db 로 사본을 줄 수 있습니다)");
}

const NEW_COLUMNS = [
  ["document_due_date", "TEXT"], ["bid_type", "TEXT"], ["bid_type_raw", "TEXT"],
  ["contractor_phone", "TEXT"], ["contractor_contact_name", "TEXT"],
  ["contractor_mobile", "TEXT"], ["contractor_address", "TEXT"],
  ["contractor_business_no", "TEXT"], ["contractor_note", "TEXT"],
  ["notice_patent_text", "TEXT"], ["notice_multi_flag", "INTEGER DEFAULT 0"],
  ["patent_confirmed", "INTEGER DEFAULT 0"], ["scopes", "TEXT"], ["quality", "TEXT"],
  ["is_rebid", "INTEGER DEFAULT 0"], ["rebid_round", "INTEGER"], ["rebid_reason", "TEXT"],
  ["previous_fail_date", "TEXT"], ["original_project_id", "TEXT"],
  ["previous_project_id", "TEXT"], ["result_entered_at", "TEXT"], ["updated_at", "TEXT"],
  ["patents_migrated", "INTEGER DEFAULT 0"], ["record_year", "TEXT"],
  ["category_items", "TEXT"], ["record_source", "TEXT"],
  ["source_ref", "TEXT"], ["duplicate_of", "TEXT"]
];

const q = (sql) => db.prepare(sql).get();
const cols = () => db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);

/* 적용 전 기록 ---------------------------------------------------------- */
const before = {
  rows: q("SELECT COUNT(*) c FROM projects").c,
  columns: cols(),
  sample: db.prepare("SELECT * FROM projects ORDER BY rowid LIMIT 10").all(),
  clash: q("SELECT COUNT(*) c FROM projects WHERE id LIKE 'rec-imp-%'").c
};
console.log(`\n[적용 전] 행 ${before.rows} · 열 ${before.columns.length}개 · rec-imp- 겹침 ${before.clash}건`);

/* 2. 새 열 더하기 ------------------------------------------------------- */
let added = 0;
NEW_COLUMNS.forEach(([name, type]) => {
  if (cols().includes(name)) return;
  db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${type}`);
  added++;
});
db.exec(`
  CREATE TABLE IF NOT EXISTS pour_project_patents (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
    display TEXT, name TEXT, method TEXT, company TEXT, category TEXT, remark TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_ppp_project_kind_number
    ON pour_project_patents (project_id, kind, number);
`);
console.log(`[마이그레이션] 새 열 ${added}개 추가 (record_year 포함) · 지운 열 0개`);

/* 3. 옮겨 심기 두 번 ---------------------------------------------------- */
db.exec(seedSql);
const once = {
  total: q("SELECT COUNT(*) c FROM projects").c,
  imported: q("SELECT COUNT(*) c FROM projects WHERE id LIKE 'rec-imp-%'").c,
  patents: q("SELECT COUNT(*) c FROM pour_project_patents").c
};
db.exec(seedSql);
const twice = {
  total: q("SELECT COUNT(*) c FROM projects").c,
  imported: q("SELECT COUNT(*) c FROM projects WHERE id LIKE 'rec-imp-%'").c,
  patents: q("SELECT COUNT(*) c FROM pour_project_patents").c
};

/* 4. 확인 --------------------------------------------------------------- */
const after = {
  kept: q("SELECT COUNT(*) c FROM projects WHERE id NOT LIKE 'rec-imp-%'").c,
  sample: db.prepare(
    "SELECT * FROM projects WHERE id NOT LIKE 'rec-imp-%' ORDER BY rowid LIMIT 10").all()
};
const years = db.prepare(
  "SELECT record_year y, COUNT(*) c FROM projects WHERE id LIKE 'rec-imp-%' GROUP BY y ORDER BY y DESC").all();
const srcRef = q(`SELECT COUNT(*) total,
  SUM(CASE WHEN source_ref IS NULL OR source_ref = '' THEN 1 ELSE 0 END) missing
  FROM projects WHERE id LIKE 'rec-imp-%'`);
const phone = q(`SELECT
  SUM(CASE WHEN phone LIKE '0%' THEN 1 ELSE 0 END) lead0,
  SUM(CASE WHEN typeof(phone) = 'integer' THEN 1 ELSE 0 END) asnum
  FROM projects WHERE id LIKE 'rec-imp-%' AND phone IS NOT NULL AND phone <> ''`);
const dates = q(`SELECT
  SUM(CASE WHEN notice_date IS NOT NULL AND notice_date <> '' THEN 1 ELSE 0 END) n,
  SUM(CASE WHEN bid_date    IS NOT NULL AND bid_date    <> '' THEN 1 ELSE 0 END) b,
  SUM(CASE WHEN award_date  IS NOT NULL AND award_date  <> '' THEN 1 ELSE 0 END) a
  FROM projects WHERE id LIKE 'rec-imp-%'`);
const kinds = q(`SELECT COUNT(*) c, COUNT(DISTINCT number) n,
  SUM(CASE WHEN kind <> 'POUR' THEN 1 ELSE 0 END) other
  FROM pour_project_patents WHERE project_id LIKE 'rec-imp-%'`);

console.log(`\n[적용 후] 전체 ${once.total} = 기존 ${after.kept} + 옮겨온 ${once.imported}`);
console.log("연도별 " + years.map((r) => `${r.y}:${r.c}`).join(" "));

let bad = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) bad++;
}
check("기존 행이 하나도 줄지 않음", after.kept === before.rows, `${before.rows} → ${after.kept}`);
check("기존 행 내용이 그대로",
  JSON.stringify(before.sample.map((r) => [r.id, r.client, r.phone, r.status, r.expected_amount])) ===
  JSON.stringify(after.sample.map((r) => [r.id, r.client, r.phone, r.status, r.expected_amount])));
check("기존 열이 하나도 사라지지 않음",
  before.columns.every((c) => cols().includes(c)), `${before.columns.length} → ${cols().length}`);
check("두 번 실행해도 늘지 않음 (id 기준 UPSERT)",
  once.total === twice.total && once.patents === twice.patents,
  `행 ${once.total}→${twice.total} · 특허 ${once.patents}→${twice.patents}`);
check("모든 행에 원본 위치가 남음", srcRef.missing === 0,
  `${srcRef.total}행 중 빠진 것 ${srcRef.missing}건`);
check("전화번호가 문자열로 남음", phone.asnum === 0, `앞자리0 ${phone.lead0}건 · 숫자로 변한 것 ${phone.asnum}건`);
check("없던 날짜를 만들지 않음", dates.n === 0 && dates.b === 0 && dates.a === 0,
  `공고일 ${dates.n} · 개찰일 ${dates.b} · 낙찰일 ${dates.a}`);
check("특허는 모두 POUR 로만 연결", kinds.other === 0,
  `${kinds.c}건 · 번호 ${kinds.n}종`);
check("SQL 에 지우는 문장 없음",
  !/\b(DELETE|DROP|TRUNCATE)\b/i.test(seedSql.replace(/^\s*--.*$/gm, "")));

console.log(bad ? `\n실패 ${bad}건 — 적용하지 마세요.` : "\n모두 통과. 운영 적용 준비 완료.");
process.exit(bad ? 1 : 0);
