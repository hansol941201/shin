/**
 * 순방향 마이그레이션 + 실적 옮겨 심기 검증 (실제 SQLite)
 *   npx tsc -p tsconfig.build.json && node test-seed.mjs
 *
 * 확인하는 것
 *   · 마이그레이션이 기존 열·행을 지우지 않고 없는 열만 더한다
 *   · 두 번 실행해도 아무 일도 일어나지 않는다
 *   · 옮겨 심기가 id 기준 UPSERT 이고 기존 행을 건드리지 않는다
 *   · 두 번 실행해도 행·특허가 늘지 않는다
 *   · 전화번호가 문자열로 남고 없던 날짜를 만들지 않는다
 *   · 사람이 나중에 더한 타사 특허를 지우지 않는다
 */
import assert from "node:assert";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const { migratePourSchema } = require("./.tmp-build/lib/pour/migrate.js");
const { seedRecords } = require("./.tmp-build/lib/pour/seed-records.js");

const RECORDS_PATH = join(HERE, "..", "test", "fixtures-records.json");
if (!existsSync(RECORDS_PATH)) {
  console.log("\n실적 자료가 없어 건너뜁니다.");
  console.log("  python3 pour-integration/scripts/import-records.py <연도별 실적List.xlsx>");
  process.exit(0);
}
const records = JSON.parse(readFileSync(RECORDS_PATH, "utf8"));

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

function d1(db) {
  return {
    prepare(sql) {
      let params = [];
      const api = {
        bind(...args) { params = args; return api; },
        async first() { return db.prepare(sql).get(...params) ?? null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { return db.prepare(sql).run(...params); }
      };
      return api;
    }
  };
}

/* 마이그레이션 전 운영 D1 을 흉내 낸다 (옛 열만 있는 상태) */
const db = new Database(":memory:");
db.exec(`
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, client TEXT, region TEXT, city TEXT, project_name TEXT,
    category TEXT, phone TEXT, households INTEGER, status TEXT,
    notice_date TEXT, bid_date TEXT, award_date TEXT, award_amount INTEGER,
    expected_amount INTEGER, contractor TEXT, patent_numbers TEXT,
    agreement_no TEXT, address TEXT, remark TEXT, created_at TEXT, legacy_memo TEXT
  );
  INSERT INTO projects (id, client, region, city, project_name, phone, households, status,
                        notice_date, award_date, award_amount, expected_amount, contractor,
                        patent_numbers, remark, created_at, legacy_memo) VALUES
    ('p-1','기존 운영 아파트 1','경기','하남','외벽 재도장공사','031-000-1111',500,'낙찰',
     '2026-01-05','2026-02-05',1250000000,900000000,'코지건설','1935719','기존 자료','2026-01-01','옛 메모'),
    ('p-2','기존 운영 아파트 2','충남','금산','외벽 도장공사','041-222-3333',430,'공고',
     '2026-02-01',NULL,NULL,500000000,NULL,'','','2026-02-01',NULL);
`);
const bind = d1(db);
const cols = () => db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
const one = (sql) => db.prepare(sql).get();

const beforeColumns = cols();
const beforeRows = db.prepare("SELECT * FROM projects ORDER BY id").all();

section("1. 순방향 마이그레이션");

let migrated;
await test("없는 열만 더하고 기존 열은 그대로", async () => {
  migrated = await migratePourSchema(bind);
  assert.ok(migrated.addedColumns.includes("record_year"), "record_year 를 더하지 않았다");
  beforeColumns.forEach((c) => assert.ok(cols().includes(c), c + " 열이 사라졌다"));
  assert.strictEqual(migrated.projectRows, beforeRows.length);
});

await test("기존 행이 그대로", () => {
  const after = db.prepare("SELECT * FROM projects ORDER BY id").all();
  assert.strictEqual(after.length, beforeRows.length);
  beforeRows.forEach((row, i) => {
    Object.keys(row).forEach((k) => assert.deepStrictEqual(after[i][k], row[k], k));
  });
});

await test("새 표 3개가 만들어짐", () => {
  const names = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pour_%'").all().map((r) => r.name);
  ["pour_patents", "pour_project_patents", "pour_project_history"]
    .forEach((t) => assert.ok(names.includes(t), t));
});

await test("두 번 실행해도 더할 것이 없다", async () => {
  const again = await migratePourSchema(bind);
  assert.deepStrictEqual(again.addedColumns, []);
  assert.strictEqual(again.projectRows, beforeRows.length);
});

section("2. 실적 옮겨 심기 (id 기준 UPSERT)");

let first;
await test("자료 건수만큼 새로 들어감", async () => {
  first = await seedRecords(bind, records);
  assert.strictEqual(first.inserted, records.length, `넣은 건수 ${first.inserted}`);
  assert.strictEqual(first.updated, 0);
  assert.strictEqual(first.skipped, 0);
  assert.strictEqual(first.rowsAfter, first.rowsBefore + records.length);
});

await test("기존 행이 하나도 줄거나 바뀌지 않음", () => {
  const kept = db.prepare("SELECT * FROM projects WHERE id NOT LIKE 'rec-imp-%' ORDER BY id").all();
  assert.strictEqual(kept.length, beforeRows.length);
  beforeRows.forEach((row, i) => {
    Object.keys(row).forEach((k) => assert.deepStrictEqual(kept[i][k], row[k], k));
  });
});

await test("연도가 record_year 에 담김", () => {
  const n = one("SELECT COUNT(*) c FROM projects WHERE id LIKE 'rec-imp-%' AND record_year GLOB '20[0-9][0-9]'").c;
  assert.strictEqual(n, records.length);
});

await test("전화번호가 문자열로 남아 앞자리 0 보존", () => {
  const r = one(`SELECT
    SUM(CASE WHEN phone LIKE '0%' THEN 1 ELSE 0 END) lead0,
    SUM(CASE WHEN typeof(phone)='integer' THEN 1 ELSE 0 END) asnum
    FROM projects WHERE id LIKE 'rec-imp-%' AND phone IS NOT NULL AND phone <> ''`);
  assert.ok(r.lead0 > 0, "앞자리 0 인 전화번호가 없다");
  assert.strictEqual(r.asnum, 0, "숫자로 바뀐 전화번호가 있다");
});

await test("원본에 없는 날짜를 만들지 않음", () => {
  const r = one(`SELECT
    SUM(CASE WHEN notice_date IS NOT NULL AND notice_date <> '' THEN 1 ELSE 0 END) n,
    SUM(CASE WHEN bid_date IS NOT NULL AND bid_date <> '' THEN 1 ELSE 0 END) b,
    SUM(CASE WHEN award_date IS NOT NULL AND award_date <> '' THEN 1 ELSE 0 END) a
    FROM projects WHERE id LIKE 'rec-imp-%'`);
  assert.deepStrictEqual([r.n, r.b, r.a], [0, 0, 0]);
});

await test("공종 대분류가 category_items 에 담긴다", () => {
  const n = one(`SELECT COUNT(*) c FROM projects
    WHERE id LIKE 'rec-imp-%' AND category_items IS NOT NULL AND category_items <> ''`).c;
  const expect = records.filter((r) => (r.categoryItems || []).length).length;
  assert.strictEqual(n, expect, `담긴 행 ${n} / 기대 ${expect}`);
  const row = db.prepare(`SELECT category, category_items FROM projects
    WHERE id LIKE 'rec-imp-%' AND category_items IS NOT NULL LIMIT 1`).get();
  const items = JSON.parse(row.category_items);
  assert.ok(Array.isArray(items) && items.length);
  assert.ok(items.every((it) => it.group && it.name), row.category_items);
  // 기존 공종 열은 그대로 이름만 담고 있다
  assert.ok(row.category.split("\n").length >= 1);
});

await test("확실하지 않은 공종은 임의로 정하지 않고 기타로 담긴다", () => {
  const all = records.flatMap((r) => r.categoryItems || []);
  // 우레탄·에폭시·아스콘·균열보수·재도장은 두 대분류에 있으므로 기타여야 한다
  const ambiguous = ["우레탄", "에폭시", "아스콘", "균열보수", "재도장"];
  all.filter((it) => ambiguous.includes(it.name))
    .forEach((it) => assert.strictEqual(it.group, "기타", it.name + " → " + it.group));
  // 한 곳에만 있는 이름은 그 대분류로 들어간다
  const singles = all.filter((it) => it.name === "슬라브" || it.name === "보도블럭");
  assert.ok(singles.length > 0, "한 대분류뿐인 공종이 없다");
  singles.forEach((it) => assert.notStrictEqual(it.group, "기타", it.name));
});

await test("특허 연결이 모두 POUR 로 들어감", () => {
  const r = one(`SELECT COUNT(*) c, SUM(CASE WHEN kind <> 'POUR' THEN 1 ELSE 0 END) other
    FROM pour_project_patents WHERE project_id LIKE 'rec-imp-%'`);
  assert.strictEqual(r.c, records.reduce((s, x) => s + x.patentItems.length, 0));
  assert.strictEqual(r.other, 0);
});

section("3. 두 번 실행");

await test("행이 늘지 않음 (전부 갱신으로 처리)", async () => {
  const rowsBefore = one("SELECT COUNT(*) c FROM projects").c;
  const patentsBefore = one("SELECT COUNT(*) c FROM pour_project_patents").c;
  const second = await seedRecords(bind, records);
  assert.strictEqual(second.inserted, 0, `두 번째에 새로 넣은 건수 ${second.inserted}`);
  assert.strictEqual(second.updated, records.length);
  assert.strictEqual(second.patentsInserted, 0);
  assert.strictEqual(one("SELECT COUNT(*) c FROM projects").c, rowsBefore);
  assert.strictEqual(one("SELECT COUNT(*) c FROM pour_project_patents").c, patentsBefore);
});

await test("세 번째도 마찬가지", async () => {
  const rows = one("SELECT COUNT(*) c FROM projects").c;
  await seedRecords(bind, records);
  assert.strictEqual(one("SELECT COUNT(*) c FROM projects").c, rows);
});

await test("겹치는 실적이 없음", () => {
  const dup = one(`SELECT COUNT(*) c FROM (
    SELECT client, project_name FROM projects WHERE id LIKE 'rec-imp-%'
    GROUP BY client, project_name HAVING COUNT(*) > 1)`).c;
  assert.strictEqual(dup, 0);
});

section("4. 사람이 고친 자료 보호");

await test("나중에 더한 타사 특허를 지우지 않음", async () => {
  const target = records[0].id;
  db.prepare(`INSERT INTO pour_project_patents
      (id, project_id, kind, number, display, sort_order, created_at, updated_at)
      VALUES ('manual-1', ?, 'THIRD_PARTY', '2091977', '제10-2091977호', 9, '2026-08-01', '2026-08-01')`)
    .run(target);
  await seedRecords(bind, records);
  const still = one("SELECT COUNT(*) c FROM pour_project_patents WHERE id = 'manual-1'").c;
  assert.strictEqual(still, 1, "사람이 더한 타사 특허가 사라졌다");
});

await test("fill 방식은 사람이 고친 값을 덮어쓰지 않음", async () => {
  const target = records[1].id;
  db.prepare("UPDATE projects SET quality = '사람이 적음', remark = '현장 확인' WHERE id = ?").run(target);
  await seedRecords(bind, records, { mode: "fill" });
  const row = db.prepare("SELECT quality, remark FROM projects WHERE id = ?").get(target);
  assert.strictEqual(row.quality, "사람이 적음");
  assert.strictEqual(row.remark, "현장 확인");
});

console.log(`\n합계 ${passed + failed}건 · 통과 ${passed} · 실패 ${failed}`);
process.exit(failed ? 1 : 0);
