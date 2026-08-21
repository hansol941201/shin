# 연도별 실적 List 1,979건 — Sites 배포용 적용 자료

`1POUR 실적 List.xlsx` (2018~2026년 9개 시트, 2,028행) 을 운영 D1 에 옮기기 위한 자료입니다.

**운영 D1 에는 아무것도 실행하지 않았습니다.** 운영 DB 는 ChatGPT Sites 가 관리하고
논리적 바인딩 이름은 `DB` 뿐이라 `wrangler d1 execute` 를 쓰지 않습니다.
마이그레이션과 옮겨 심기는 **Codex 의 Sites 배포 과정에서** 바인딩 `DB` 를 통해 실행합니다.

## 예상 반영 건수

| 항목 | 건수 |
|---|---|
| 엑셀 원본 | **2,029행** (9개 시트, 내용이 있는 모든 줄) |
| **`projects` 에 새로 들어갈 행** | **2,029행** — 한 줄도 빼지 않는다 (`rec-imp-0001` ~ `rec-imp-2029`) |
| 겹치는 줄 | 49행 — **지우지 않고 `duplicate_of` 로 표시만** |
| **`pour_project_patents` 에 들어갈 특허 연결** | **2,050건** (특허번호 38종) |
| 기존 `projects` 행 변경 | **0행** (새 id 라 겹치지 않음) |
| 기존 행·열 삭제 | **0건** |

연도별: 2026 324 · 2025 494 · 2024 331 · 2023 266 · 2022 189 · 2021 233 · 2020 120 · 2019 68 · 2018 4
(각 시트에서 내용이 있는 줄 수와 정확히 같다 — 줄 번호까지 하나하나 대조 완료)

`projects` 에 더해지는 열은 24개이며 전부 NULL 허용입니다. 기존 행은 그대로 NULL 이 됩니다.

## 지켜야 할 것과 지킨 방법

| 원칙 | 어떻게 지켰는지 | 확인 |
|---|---|---|
| 기존 D1 자료를 지우지 않는다 | 마이그레이션·옮겨 심기 어디에도 `DELETE`/`DROP`/`TRUNCATE` 가 없다 | `check-no-destructive.mjs` |
| 표를 통째로 갈아끼우지 않는다 | `REPLACE INTO` · `INSERT OR REPLACE` · `ALTER TABLE … RENAME` · `CREATE TABLE … AS SELECT` 없음 | `check-no-destructive.mjs` |
| 기존 ID 기준 UPSERT | `INSERT … ON CONFLICT(id) DO UPDATE` 1,979건 전부. 특허는 `(project_id, kind, number)` | `check-no-destructive.mjs`, `test-seed.mjs` |
| 두 번 실행해도 중복 없음 | 두 번·세 번 실행해도 행 수·특허 수가 그대로 | `test-seed.mjs` |
| 전화번호는 문자열 | SQL 리터럴이 언제나 따옴표. `typeof(phone) = 'text'` | `test-seed.mjs` |
| 없는 날짜·특허번호를 만들지 않는다 | `notice_date`/`bid_date`/`award_date` 를 넣지 않는다. 연도만 `record_year` | `test-seed.mjs` |
| record_year 는 순방향 | 열 하나만 더한다. 기존 열·행은 그대로 | `test-seed.mjs` |
| 사람이 고친 자료를 덮지 않는다 | 나중에 더한 타사 특허를 지우지 않는다. `mode: "fill"` 이면 빈 칸만 채운다 | `test-seed.mjs` |
| 실제 자료를 GitHub 에 올리지 않는다 | 아래 3개는 `.gitignore` 대상 · 커밋 이력에도 없음 | `git log --all` |

## 저장소에 올리지 않는 파일 (엑셀에서 다시 만든다)

| 파일 | 내용 |
|---|---|
| `test/fixtures-records.json` | 실적 1,979건 |
| `nextjs/drizzle/seed-records.sql` | 옮겨 심기 SQL (UPSERT 1,979건) |
| `preview-records.html` | 실적이 든 화면 |

```sh
python3 pour-integration/scripts/import-records.py <연도별 실적List.xlsx>
```

## 1. 적용 전 확인 쿼리

`nextjs/drizzle/verify-records.sql` 의 **[1]~[4]** 를 먼저 돌려 결과를 저장합니다.
읽기만 하는 질의라 자료를 바꾸지 않습니다.

| 번호 | 확인 |
|---|---|
| [1] | 기존 전체 행수 · 상태별 건수 (적용 후와 비교할 기준값) |
| [2] | `rec-imp-%` id 가 이미 쓰이고 있지 않은지 (**0 이어야 한다**) |
| [3] | `record_year` 열이 있는지 (`PRAGMA table_info(projects)`) |
| [4] | 표본 10건 — 적용 후 그대로인지 눈으로 비교 |

## 2. 순방향 마이그레이션 (둘 중 하나)

**(가) Drizzle 마이그레이션 파일** — Sites 배포가 drizzle 기록(journal)으로 한 번씩 실행할 때

```
nextjs/drizzle/0002_pour_integration.sql     새 표 3개 + projects 새 열 23개
nextjs/drizzle/0003_pour_record_year.sql     ALTER TABLE projects ADD COLUMN record_year TEXT;
nextjs/drizzle/0004_pour_category_items.sql  ALTER TABLE projects ADD COLUMN category_items TEXT;
nextjs/drizzle/0005_pour_record_source.sql   ALTER TABLE projects ADD COLUMN record_source TEXT;
nextjs/drizzle/0006_pour_source_ref.sql      ALTER TABLE projects ADD COLUMN source_ref / duplicate_of TEXT;
```

**(나) 실행 시점 마이그레이션** — 기록 없이 배포 코드에서 직접 부를 때 (권장)

```ts
import { migratePourSchema } from "@/lib/pour/migrate";

const result = await migratePourSchema(env.DB);
// { addedColumns, existingColumns, tables, projectRows }
```

`PRAGMA table_info` 로 **없는 열만 골라** 더하므로 몇 번을 실행해도 안전하고,
이미 `pour-migrate.mjs` 로 열을 더해 둔 상태에서도 오류가 나지 않습니다.
행 수가 달라지면 예외를 던지고 멈춥니다.

## 3. 옮겨 심기 (둘 중 하나)

**(가) 코드** — 배포 과정에서 바인딩 `DB` 로 부를 때

```ts
import { migratePourSchema } from "@/lib/pour/migrate";
import { seedRecords } from "@/lib/pour/seed-records";
import records from "<실적 자료 JSON>";      // 저장소 밖에서 넣어 주세요

await migratePourSchema(env.DB);
const result = await seedRecords(env.DB, records);
// { inserted, updated, patentsInserted, patentsUpdated, skipped, rowsBefore, rowsAfter }

// 사람이 고쳐 둔 값을 덮지 않으려면
await seedRecords(env.DB, records, { mode: "fill" });
```

**(나) SQL** — `nextjs/drizzle/seed-records.sql` 을 그대로 실행. 내용은 동일합니다.

## 4. 적용 후 확인

`verify-records.sql` 의 **[5]~[11]** 을 돌려 [1]~[4] 와 비교합니다.

| 번호 | 통과 기준 |
|---|---|
| [5] | `기존_남은행수` 가 [1] 과 같고, `옮겨온_행수` 가 1,979 |
| [6] | 표본 10건이 [4] 와 같음 |
| [7] | 연도별 건수가 위 표와 같음 |
| [8] | 모든 행에 `source_ref` 가 있음 (빠진 줄 0) |
| [9] | `숫자로_변한_전화` **0**, `앞자리0_전화` 1,906 |
| [10] | 특허 연결 2,003건 · `POUR가_아닌_것` **0** |
| [11] | 공고일·개찰일·낙찰일 채워짐 **0 0 0** |
| [12] | 같은 것을 한 번 더 실행하고 [5] 를 다시 봐도 숫자가 같음 |

되돌릴 일이 생기면 옮겨 온 행은 전부 `id LIKE 'rec-imp-%'` 로만 골라집니다.
기존 행에는 손대지 않았습니다.

## 지금 여기서 돌릴 수 있는 검증

```sh
node pour-integration/scripts/check-no-destructive.mjs   # 지우는 문장 검사
node pour-integration/scripts/dry-run-seed.mjs           # 예행연습 (운영을 건드리지 않음)
sh   pour-integration/test/run-all.sh                    # 전체
```

## 원본을 고치지 않은 것

* 마스터에 없는 특허번호 7종 (`0508729` 5건, `2574836` 3건, `2119348` 2건, `1520738` 2건,
  `211934` `2015465` `0976846` 각 1건) → 고치지 않고 **특허번호 미기재·미확인 낙찰 알림 32건**으로 잡힙니다.
* `건설신기술 1026호` · `탄성강화 파우더` → 특허번호가 아니므로 번호로 바꾸지 않고
  **공고문 특허·공법 원문**에 원문 그대로 남깁니다 (14건).
* 원본에 날짜가 없어 공고일·개찰일·낙찰일은 비워 둡니다. 연도만 `record_year` 에 담습니다.
* 공종은 분류표로 옮기되 **확실할 때만** 대분류를 붙입니다.
  `우레탄`·`에폭시`·`아스콘`·`균열보수`·`재도장` 처럼 두 대분류에 걸친 이름과
  표에 없는 이름은 임의로 정하지 않고 **기타**로 두었습니다 (이름은 그대로).
  대분류가 정해진 행 1,143건 · 기타만 있는 행 836건 — 화면에서 다시 고를 수 있습니다.
* **모든 시트의 모든 줄을 하나도 빼지 않았습니다.** 겹치는 줄 49개도 지우거나 합치지 않고
  `duplicate_of` 로 어느 줄과 겹치는지 표시만 했습니다.
  알맹이가 지역·도시뿐인 줄(2022년 214행) 하나도 원본에 있던 줄이라 그대로 남겼습니다.
* 모든 행에 `source_ref`("2025년 348행")를 남겨 언제든 원본으로 되짚을 수 있습니다.
* 협약서 발행번호도 만들어 내지 않습니다. 옮겨 온 행은 `record_source = "import"` 로 표시해
  **"협약서번호 미입력" 알림에서 뺍니다** (1,979건이 알림을 덮지 않도록).
  처리 단계 열에는 사실대로 "협약서번호 미입력" 이 보이고, 상세 수정 화면에서 직접 넣을 수 있습니다.
