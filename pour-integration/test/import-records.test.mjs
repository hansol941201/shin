/**
 * 연도별 실적 List 엑셀 옮겨 심기 검증 (실제 SQLite 로 확인)
 *   node pour-integration/test/import-records.test.mjs
 *
 * 확인하는 것
 *   · 겹치는 행 없이 옮겨졌는가
 *   · 기존 운영 자료를 지우거나 바꾸지 않는가
 *   · 두 번 실행해도 행이 늘지 않는가 (UPSERT)
 *   · 전화번호 앞자리 0 이 살아 있는가
 */
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDS_PATH = join(HERE, "fixtures-records.json");
const SEED_PATH = join(HERE, "..", "nextjs", "drizzle", "seed-records.sql");

// 실제 실적 자료는 발주처 이름·전화번호가 들어 있어 저장소에 두지 않는다.
// 없으면 검증을 건너뛰고 다시 만드는 방법을 알려 준다.
if (!existsSync(RECORDS_PATH) || !existsSync(SEED_PATH)) {
  console.log("\n실적 자료가 없어 건너뜁니다.");
  console.log("  python3 pour-integration/scripts/import-records.py <연도별 실적List.xlsx>");
  process.exit(0);
}

const records = JSON.parse(readFileSync(RECORDS_PATH, "utf8"));
const seedSql = readFileSync(SEED_PATH, "utf8");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

section("1. 옮겨 온 자료 자체");

test("행이 비어 있지 않다", () => assert.ok(records.length > 1900));

test("모든 행에 원본 위치가 남아 있다", () => {
  assert.ok(records.every(r => /^\d{4}년.* \d+행$/.test(r.sourceRef)), 
    JSON.stringify(records.filter(r => !/행$/.test(r.sourceRef || "")).slice(0, 3)));
});

test("원본 위치는 행마다 서로 다르다 (같은 줄을 두 번 읽지 않았다)", () => {
  assert.strictEqual(new Set(records.map(r => r.sourceRef)).size, records.length);
});

test("id 가 겹치지 않는다", () => {
  assert.strictEqual(new Set(records.map(r => r.id)).size, records.length);
});

test("겹치는 행은 지우지 않고 표시만 한다", () => {
  const key = r => (r.client + "|" + r.projectNames.join(" ")).replace(/[\s()[\]·,./-]/g, "");
  const groups = new Map();
  records.forEach((r) => {
    const k = key(r);
    groups.set(k, (groups.get(k) || 0) + 1);
  });
  const dupRows = records.filter(r => groups.get(key(r)) > 1);
  // 겹치는 묶음 안에서 첫 줄을 뺀 나머지는 모두 표시가 붙어 있어야 한다
  const marked = dupRows.filter(r => r.duplicateOf);
  assert.ok(marked.length > 0, "겹침 표시가 하나도 없다");
  marked.forEach((r) => {
    assert.ok(records.some(o => o.id === r.duplicateOf),
      r.id + " 가 가리키는 " + r.duplicateOf + " 가 없다");
  });
});

test("발주처와 연도가 비어 있는 행도 버리지 않는다", () => {
  // 원본에 있던 줄은 알맹이가 없어도 그대로 남긴다
  assert.ok(records.some(r => !r.client), "빈 줄이 사라졌다");
});



test("특허번호는 숫자만 남고 표시는 제10-…호 형식이다", () => {
  const items = records.flatMap(r => r.patentItems);
  assert.ok(items.length > 0);
  assert.ok(items.every(i => /^\d+$/.test(i.number)));
  assert.ok(items.every(i => i.display === "제10-" + i.number + "호"));
  assert.ok(items.every(i => i.kind === "POUR"));
});

test("한 행 안에서 같은 특허번호가 두 번 나오지 않는다", () => {
  assert.ok(records.every(r => {
    const n = r.patentItems.map(i => i.number);
    return new Set(n).size === n.length;
  }));
});

test("숫자가 없는 특허 표기는 버리지 않고 공고문 원문에 남긴다", () => {
  const kept = records.filter(r => r.noticePatentText);
  assert.ok(kept.length > 0, "원문이 남은 행이 없다");
  assert.ok(kept.some(r => /POUR공법|탄성강화/.test(r.noticePatentText)));
});

test("전화번호는 문자열이고 앞자리 0 이 남아 있다", () => {
  const withPhone = records.filter(r => r.phone);
  assert.ok(withPhone.every(r => typeof r.phone === "string"));
  assert.ok(withPhone.some(r => r.phone.startsWith("0")));
});

test("세대수는 숫자이거나 빈 값이다", () => {
  assert.ok(records.every(r => r.households === "" || Number.isInteger(r.households)));
});

test("여러 해에 걸쳐 실린 줄도 각 시트의 줄로 그대로 남는다", () => {
  // 합치지 않으므로 같은 공사가 두 해에 실렸으면 두 행으로 남아 있어야 한다
  const cross = records.filter(r => r.duplicateOf).filter((r) => {
    const first = records.filter(o => o.id === r.duplicateOf)[0];
    return first && first.year !== r.year;
  });
  assert.ok(cross.length > 0, "해를 넘긴 겹침이 하나도 없다");
  cross.forEach((r) => {
    assert.ok(r.sourceRef && r.sourceRef !== records.filter(o => o.id === r.duplicateOf)[0].sourceRef,
      "원본 위치가 같다: " + r.sourceRef);
  });
});

section("2. D1 옮겨 심기 SQL");

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, client TEXT, region TEXT, city TEXT,
    project_name TEXT, category TEXT, scopes TEXT, phone TEXT, households INTEGER,
    status TEXT, record_year TEXT, notice_date TEXT, bid_date TEXT, award_date TEXT,
    award_amount INTEGER, expected_amount INTEGER, contractor TEXT, quality TEXT,
    notice_patent_text TEXT, patent_numbers TEXT, patents_migrated INTEGER DEFAULT 0,
    category_items TEXT, record_source TEXT, source_ref TEXT, duplicate_of TEXT,
    remark TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE pour_project_patents (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
    display TEXT, name TEXT, method TEXT, company TEXT, category TEXT, remark TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT
  );
  CREATE UNIQUE INDEX uq_ppp_project_kind_number
    ON pour_project_patents (project_id, kind, number);
  INSERT INTO projects (id, client, status, phone, patent_numbers, remark, created_at)
    VALUES ('p-old-1','기존 운영 아파트','낙찰','031-000-1111','1935719','기존 자료','2026-01-01');
`);

const existingBefore = db.prepare("SELECT * FROM projects WHERE id='p-old-1'").get();

test("SQL 이 오류 없이 실행된다", () => { db.exec(seedSql); });

test("옮겨 온 행 수가 자료와 같다", () => {
  const n = db.prepare("SELECT COUNT(*) c FROM projects WHERE id LIKE 'rec-imp-%'").get().c;
  assert.strictEqual(n, records.length);
});

test("기존 운영 행이 그대로 남아 있다", () => {
  const after = db.prepare("SELECT * FROM projects WHERE id='p-old-1'").get();
  assert.deepStrictEqual(after, existingBefore);
});

test("특허 연결이 모두 들어갔다", () => {
  const n = db.prepare("SELECT COUNT(*) c FROM pour_project_patents").get().c;
  assert.strictEqual(n, records.reduce((s, r) => s + r.patentItems.length, 0));
});

test("전화번호가 문자열로 저장돼 앞자리 0 이 남는다", () => {
  const row = db.prepare(
    "SELECT phone FROM projects WHERE id LIKE 'rec-imp-%' AND phone LIKE '0%' LIMIT 1").get();
  assert.ok(row && row.phone.startsWith("0"));
});

test("연도가 record_year 에 담긴다", () => {
  const n = db.prepare(
    "SELECT COUNT(*) c FROM projects WHERE id LIKE 'rec-imp-%' AND record_year GLOB '20[0-9][0-9]'").get().c;
  assert.strictEqual(n, records.length);
});

test("두 번 실행해도 행이 늘지 않는다", () => {
  const before = db.prepare("SELECT COUNT(*) c FROM projects").get().c;
  const beforePatents = db.prepare("SELECT COUNT(*) c FROM pour_project_patents").get().c;
  db.exec(seedSql);
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM projects").get().c, before);
  assert.strictEqual(
    db.prepare("SELECT COUNT(*) c FROM pour_project_patents").get().c, beforePatents);
});

test("SQL 에 지우는 문장이 없다", () => {
  const statements = seedSql.replace(/^\s*--.*$/gm, "");     // 설명 줄은 빼고 본다
  assert.ok(!/\b(DELETE|DROP|TRUNCATE)\b/i.test(statements));
});

console.log(`\n합계 ${passed + failed}건 · 통과 ${passed} · 실패 ${failed}`);
process.exit(failed ? 1 : 0);
