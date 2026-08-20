/**
 * D1 순방향 마이그레이션 검증 (실제 SQLite 로 확인)
 *   node pour-integration/test/migration.test.mjs
 *
 * 확인하는 것: 기존 표와 자료를 그대로 두고 없는 것만 더한다.
 */
import assert from "node:assert";
import Database from "better-sqlite3";
import { migrate } from "../migrations/migrate.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
async function testAsync(name, fn) {
  try { await fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

/** D1 바인딩과 같은 모양으로 감싼다. */
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

/* 운영 D1 을 흉내 낸 기존 자료 */
const db = new Database(":memory:");
db.exec(`
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, client TEXT, region TEXT, city TEXT,
    phone TEXT, households INTEGER, status TEXT,
    notice_date TEXT, bid_date TEXT, award_date TEXT,
    award_amount INTEGER, expected_amount INTEGER, contractor TEXT,
    patent_numbers TEXT, remark TEXT, created_at TEXT
  );
  INSERT INTO projects VALUES
    ('p-1','가나아파트','경기','하남','031-000-1111',500,'낙찰','2026-01-05','2026-01-25','2026-02-05',
     1250000000, 900000000,'코지건설','1935719','기존 자료','2026-01-01'),
    ('p-2','나다아파트','충남','금산','041-222-3333',430,'공고','2026-02-01',NULL,NULL,
     NULL, 500000000, NULL, NULL,'', '2026-02-01');
`);

const before = {
  rows: db.prepare("SELECT * FROM projects ORDER BY id").all(),
  columns: db.prepare("PRAGMA table_info(projects)").all().map(c => c.name)
};

section("1. 마이그레이션 실행");

let result;
await testAsync("한 번 실행", async () => {
  result = await migrate(d1(db), { projectsTable: "projects" });
  assert.ok(result.created.includes("pour_patents"), result.created.join(","));
  assert.ok(result.added.includes("contractor_phone"), result.added.join(","));
  assert.strictEqual(result.projectCount, 2);
});

await testAsync("여러 번 실행해도 같은 결과 (다시 더하지 않음)", async () => {
  const again = await migrate(d1(db), { projectsTable: "projects" });
  assert.strictEqual(again.added.length, 0, "두 번째 실행에서 열을 또 추가함: " + again.added.join(","));
  assert.ok(again.skipped.length > 0);
  assert.strictEqual(again.projectCount, 2);
});

section("2. 기존 자료 보존");

test("기존 행이 그대로 남아 있음", () => {
  const after = db.prepare("SELECT * FROM projects ORDER BY id").all();
  assert.strictEqual(after.length, before.rows.length);
  before.rows.forEach((row, i) => {
    Object.keys(row).forEach(key => {
      assert.deepStrictEqual(after[i][key], row[key], `${row.id}.${key} 값이 바뀜`);
    });
  });
});

test("기존 열이 하나도 사라지지 않음", () => {
  const after = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
  before.columns.forEach(c => assert.ok(after.includes(c), c + " 열이 사라짐"));
  assert.ok(after.includes("expected_amount"), "예상금액 열이 사라짐");
});

test("새 열은 NULL 로 추가되어 기존 행에 영향이 없음", () => {
  const row = db.prepare("SELECT * FROM projects WHERE id='p-1'").get();
  assert.strictEqual(row.contractor_phone, null);
  assert.strictEqual(row.document_due_date, null);
  assert.strictEqual(row.rebid_round, null);
  assert.strictEqual(row.award_amount, 1250000000, "기존 낙찰금액이 바뀜");
});

test("발주처 전화번호와 시공사 전화번호가 별도 열", () => {
  const columns = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
  assert.ok(columns.includes("phone"), "발주처 전화번호 열 없음");
  assert.ok(columns.includes("contractor_phone"), "시공사 전화번호 열 없음");
});

section("3. 새 표 구조");

test("특허 · 현장별 특허 · 수정 이력 표가 생김", () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  ["pour_patents", "pour_project_patents", "pour_project_history"].forEach(t =>
    assert.ok(tables.includes(t), t + " 없음"));
});

test("같은 현장에 같은 특허를 두 번 넣을 수 없음", () => {
  db.prepare(`INSERT INTO pour_project_patents (id, project_id, kind, number)
              VALUES ('x1','p-1','POUR','1935719')`).run();
  assert.throws(() => {
    db.prepare(`INSERT INTO pour_project_patents (id, project_id, kind, number)
                VALUES ('x2','p-1','POUR','1935719')`).run();
  }, /UNIQUE/);
});

test("POUR 와 타사에 같은 번호는 각각 저장 가능 (구분이 다름)", () => {
  db.prepare(`INSERT INTO pour_project_patents (id, project_id, kind, number)
              VALUES ('x3','p-1','THIRD_PARTY','1935719')`).run();
  const n = db.prepare("SELECT COUNT(*) AS n FROM pour_project_patents WHERE project_id='p-1'").get().n;
  assert.strictEqual(n, 2);
});

test("마이그레이션에 DROP·DELETE·TRUNCATE 가 없음", async () => {
  const fs = await import("node:fs");
  const sources = [
    fs.readFileSync(new URL("../migrations/migrate.js", import.meta.url), "utf8"),
    fs.readFileSync(new URL("../migrations/0001_pour_forward.sql", import.meta.url), "utf8")
  ].join("\n").toUpperCase();
  ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"].forEach(word =>
    assert.ok(sources.indexOf(word) < 0, word + " 가 들어 있음"));
});

console.log("\n" + "=".repeat(52));
console.log(`  통과 ${passed} · 실패 ${failed}`);
console.log("=".repeat(52));
process.exit(failed ? 1 : 0);
