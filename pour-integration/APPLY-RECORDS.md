# 연도별 실적 List 1,979건 — 운영 D1 적용 절차

`1POUR 실적 List.xlsx` (2018~2026년 9개 시트, 2,028행) 을 운영 D1 에 옮기는 절차입니다.
**아직 실행하지 않았습니다.** 아래는 준비된 파일과 예행연습 결과입니다.

## 지켜야 할 것

| 원칙 | 어떻게 지켰는지 |
|---|---|
| 기존 D1 자료를 지우지 않는다 | SQL 에 `DELETE` / `DROP` / `TRUNCATE` 가 없다 |
| id 기준 UPSERT | `INSERT … ON CONFLICT(id) DO UPDATE` · 특허는 `(project_id, kind, number)` |
| 두 번 실행해도 중복되지 않는다 | 예행연습에서 두 번 실행 후 행 수·특허 수가 동일 |
| 전화번호는 문자열 | SQL 리터럴이 언제나 따옴표. `typeof(phone) = 'text'` |
| 없는 날짜·특허번호를 만들지 않는다 | `notice_date` / `bid_date` / `award_date` 를 넣지 않는다. 연도만 `record_year` 에 담는다 |
| record_year 는 순방향 | 새 열만 더하고 기존 열·자료는 그대로 |
| 실제 자료는 GitHub 에 올리지 않는다 | 아래 3개 파일은 `.gitignore` 대상. 공개 `docs/index.html` 은 예시 자료로만 만든다 |

## 저장소에 올리지 않는 파일 (엑셀에서 다시 만든다)

| 파일 | 내용 |
|---|---|
| `test/fixtures-records.json` | 실적 1,979건 |
| `nextjs/drizzle/seed-records.sql` | D1 옮겨 심기 SQL |
| `preview-records.html` | 실적이 들어간 화면 |

```sh
python3 pour-integration/scripts/import-records.py <연도별 실적List.xlsx>
```

## 적용 순서

```sh
# 0) 자료 만들기 (저장소에는 남지 않는다)
python3 pour-integration/scripts/import-records.py <연도별 실적List.xlsx>

# 1) 예행연습 — 운영을 건드리지 않는다
node pour-integration/scripts/dry-run-seed.mjs
#    운영 사본이 있으면:  node .../dry-run-seed.mjs --db <내려받은 사본.sqlite>

# 2) 적용 전 상태 기록
npx wrangler d1 execute <DB> --remote --file pour-integration/nextjs/drizzle/verify-records.sql
#    [1]~[4] 결과를 저장해 둔다

# 3) record_year 를 포함한 새 열 더하기 (없는 열만 · 지우지 않는다)
node pour-integration/nextjs/scripts/pour-migrate.mjs --db <DB> --table projects --remote

# 4) 실적 옮겨 심기
npx wrangler d1 execute <DB> --remote --file pour-integration/nextjs/drizzle/seed-records.sql

# 5) 적용 후 확인 — [5]~[11] 을 [1]~[4] 와 비교
npx wrangler d1 execute <DB> --remote --file pour-integration/nextjs/drizzle/verify-records.sql
```

되돌리기: 옮겨 온 행은 `id LIKE 'rec-imp-%'` 로만 골라낼 수 있습니다.
기존 행에는 손대지 않았으므로 지울 일이 생기면 이 조건 하나로 충분합니다.

## 예행연습 결과

```
[적용 전] 행 2 · 열 20개 · rec-imp- 겹침 0건
[마이그레이션] 새 열 24개 추가 (record_year 포함) · 지운 열 0개
[적용 후] 전체 1981 = 기존 2 + 옮겨온 1979
연도별 2026:320 2025:478 2024:316 2023:260 2022:185 2021:229 2020:120 2019:67 2018:4

  ✓ 기존 행이 하나도 줄지 않음 — 2 → 2
  ✓ 기존 행 내용이 그대로
  ✓ 기존 열이 하나도 사라지지 않음 — 20 → 44
  ✓ 두 번 실행해도 늘지 않음 (id 기준 UPSERT) — 행 1981→1981 · 특허 2003→2003
  ✓ 겹치는 실적 없음 — 0묶음
  ✓ 전화번호가 문자열로 남음 — 앞자리0 1906건 · 숫자로 변한 것 0건
  ✓ 없던 날짜를 만들지 않음 — 공고일 0 · 개찰일 0 · 낙찰일 0
  ✓ 특허는 모두 POUR 로만 연결 — 2003건 · 번호 38종
  ✓ SQL 에 지우는 문장 없음
```

## 원본을 고치지 않은 것들

원본에 있는 그대로 두고, 손대야 할 것은 화면 알림으로 넘겼습니다.

* 마스터에 없는 특허번호 7종 (`0508729` 5건, `2574836` 3건, `2119348` 2건, `1520738` 2건,
  `211934` `2015465` `0976846` 각 1건) → 고치지 않고 **특허번호 미기재·미확인 낙찰 알림 32건**으로 잡힙니다.
* `건설신기술 1026호` · `탄성강화 파우더` → 특허번호가 아니므로 번호로 바꾸지 않고
  **공고문 특허·공법 원문**에 원문 그대로 남깁니다 (14건).
* 원본에 날짜가 없어 공고일·개찰일·낙찰일은 비워 둡니다. 연도만 `record_year` 에 담습니다.
* 지역·도시만 있고 발주처·공사명·특허·전화가 모두 빈 1줄은 실적으로 세지 않았습니다.
