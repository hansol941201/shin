# 서버(API · D1) 규격

화면은 **localStorage 를 운영 저장소로 쓰지 않습니다.**
`window.POUR_API_BASE` 를 지정하면 그 주소의 API 를 통해 D1 을 읽고 씁니다.

```html
<script>window.POUR_API_BASE = "/api";</script>
<script src="pour-store.js"></script>
<script src="app.js"></script>
```

지정하지 않으면 브라우저 저장소를 쓰는 화면 확인용 모드로 동작합니다.
운영에서는 반드시 지정하세요.

## 필요한 엔드포인트

| 메서드 | 주소 | 내용 |
|---|---|---|
| `GET` | `{base}/records` | 공고·실적 배열 |
| `PUT` | `{base}/records` | 공고·실적 배열 저장 (id 기준 **upsert**, 전체 교체 금지) |
| `GET` | `{base}/patents` | POUR 특허 배열 |
| `PUT` | `{base}/patents` | POUR 특허 배열 저장 (number 기준 **upsert**) |

`PUT` 은 화면에 있는 자료 전부를 보냅니다. 서버는 **id/number 로 맞춰 갱신하거나 새로 넣기만** 하고,
요청에 없는 행을 지우면 안 됩니다. 지우기는 별도 기능으로 다루세요.

## 공고·실적 한 건의 모양

```jsonc
{
  "id": "rec-…",                    // 고유 ID (절대 바뀌지 않음)
  "status": "공고",                  // 공고 | 낙찰 | 유찰 | 공고취소 | 재공고 | 타공법 낙찰
  "client": "평택비전지웰푸르지오",     // 발주처(아파트명)
  "region": "경기", "city": "평택",   // 지역·도시는 분리 저장
  "projectNames": ["…", "…"],       // 공사명 (여러 건)
  "categories": ["재도장", "…"],      // 공종
  "scopes": ["외벽", "옥상"],         // 공사범위
  "phone": "031-647-3158",          // 발주처·관리사무소 전화번호 (문자열)
  "households": 717,                 // 세대수 (숫자, 없으면 "")
  "noticeDate": "2026-03-02",
  "documentDueDate": "2026-03-14",
  "bidDate": "2026-03-20",
  "bidType": "전자입찰",              // 서류접수 | 전자입찰 | 확인 필요
  "bidTypeRaw": "전자입찰(적격)",      // 기존 표기 원본
  "contractor": "코지건설㈜",
  "contractorPhone": "031-647-3158", // 시공사 전화번호 (발주처와 별도 · 문자열)
  "contractorContactName": "", "contractorMobile": "",
  "contractorAddress": "", "contractorBusinessNo": "", "contractorNote": "",
  "awardDate": "2026-05-10", "awardAmount": 1250000000,
  "agreementNo": "", "quality": "우수", "address": "", "remark": "",
  "noticePatentText": "POUR공법 (특허 제10-1935719호)",  // 공고문 원문
  "patentItems": [                   // POUR·타사 특허를 개별 항목으로
    { "id": "pat-…", "kind": "POUR", "number": "1935719",
      "display": "제10-1935719호", "name": "…", "category": "균열보수" },
    { "id": "pat-…", "kind": "THIRD_PARTY", "number": "2091977",
      "company": "타사명", "name": "균열보수 공법" }
  ],
  "patentNumbers": ["1935719"],      // patentItems 의 POUR 만 뽑은 값 (읽기 전용)
  "thirdPatentNumbers": ["2091977"], // 타사만 뽑은 값 (읽기 전용)
  "noticeMultiFlag": false,          // 공고문에 다특허로 기재됨
  "patentConfirmed": false,          // 관리자 직접 확인 완료
  "isRebid": false, "rebidRound": "", "rebidReason": "",
  "previousFailDate": "", "originalProjectId": "", "previousProjectId": "",
  "createdAt": "2026-03-02 10:00:00",  // 최초 등록일 (바꾸지 않음)
  "resultEnteredAt": "", "updatedAt": "",
  "history": [                        // 수정 이력
    { "at": "2026-05-10 14:20:00", "action": "낙찰 처리",
      "statusBefore": "공고", "statusAfter": "낙찰",
      "changes": [{ "field": "contractor", "label": "시공사",
                    "before": "", "after": "코지건설㈜" }] }
  ]
}
```

### 저장할 때 지켜야 할 것

- **전화번호는 문자열로 저장**하세요. 숫자로 바꾸면 앞자리 0 이 사라집니다.
- `phone` 과 `contractorPhone` 은 **다른 열**입니다. 서로 복사하지 마세요.
- `patentItems` 가 **빈 배열로 오면 특허를 모두 지웠다는 뜻**입니다.
  예전 번호를 되살리지 말고 그대로 비워야 합니다.
- `id` 와 `createdAt` 은 절대 바꾸지 마세요.

## POUR 특허 한 건의 모양

```jsonc
{
  "number": "1935719",               // 숫자만 남긴 값 (키)
  "name": "콘크리트 구조물의 크랙 보수를 위한 보수층",
  "categories": ["균열보수", "균열보수 및 재도장"],  // 한 특허가 여러 공종에 걸칠 수 있음
  "category": "균열보수, 균열보수 및 재도장",
  "company": "㈜넷폼알앤디",
  "prefix": "", "remark": "", "active": true
}
```

## D1 마이그레이션

`migrations/0001_pour_forward.sql` 과 `migrations/migrate.js` 를 쓰세요.

```js
import { migrate } from "./migrations/migrate.js";
const result = await migrate(env.DB, { projectsTable: "projects" });
// { created: [...], added: [...], skipped: [...], projectCount: 1248 }
```

- 없는 표와 없는 열만 더합니다. 여러 번 실행해도 안전합니다.
- `DROP` · `DELETE` · `TRUNCATE` 를 쓰지 않습니다.
- 새 열은 전부 NULL 허용이라 기존 행이 그대로 유지됩니다.
- `expected_amount` 같은 기존 열은 **남겨 둡니다.** 화면에서 쓰지 않을 뿐입니다.
