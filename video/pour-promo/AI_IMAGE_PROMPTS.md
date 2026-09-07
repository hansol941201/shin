# POUR 홍보영상 — 이미지 자산 명세 (v16 기준)

영상은 **1920×1080 / 30fps / 1분 46초**. 슬롯 36개 중 5개 확보, 31개 미확보.

미확보 슬롯은 최종 영상에 **안내 문구도 파일명도 점선 상자도 나오지 않는다.**
브랜드 톤의 부드러운 면(또는 단계 카드)으로만 렌더된다.
슬롯 이름을 눈으로 확인해야 할 때만 `PHLABEL=1 node render.js` 로 라벨을 켠다.

파일을 `assets/<슬롯이름>.jpg|png|webp` 로 넣으면 **코드 수정 없이** 자동으로 들어간다.
파일명을 바꾸기 싫으면 `assets/map.json` 에 `{"슬롯이름":"실제파일명.jpg"}` 로 지정한다.

---

## 0. 확보된 원본 (교체 불필요)

| 슬롯 | 내용 | 등장 |
|---|---|---|
| `factory_yongin` | 용인공장 전경 | 0:35 |
| `material_1` | POUR 자재 (누끼 적용됨) | 0:37 |
| `seminar_1` | 공법설명회 현장 | 0:40 |
| `consulting_1` | 컨설팅 내역서 | 0:14 · 0:44 |
| `tech_doc_1` | 기술자료 세트 | 0:44 |

> 이 다섯 장은 **실물 원본**이다. 문서의 글자·로고·도장, 자재의 라벨·색상·형태·제품명은
> 어떤 경우에도 수정하지 않는다. AI 이미지로 대체하지 않는다.

---

## 1. AI 실사 이미지가 들어갈 자리 (7개) — 최우선

### 공통 스타일 (7장 모두 동일하게)

```
Korean modern construction industry, photorealistic corporate photography,
bright natural daylight, soft even lighting, clean and professional,
unified palette of blue / white / light grey, shallow depth of field,
authentic Korean people, accurate safety helmets and hi-vis safety vests,
realistic tablets, blueprints and construction equipment,
shot on 35mm, corporate brochure quality, 16:9
```

### 공통 네거티브 (7장 모두 동일하게)

```
text, letters, korean text, english text, logo, watermark, signature, caption,
deformed hands, extra fingers, malformed faces, distorted anatomy,
impossible architecture, floating objects, warped structures,
oversaturated, HDR halo, cartoon, illustration, 3d render, cgi,
dark moody lighting, night, cluttered background
```

| 슬롯 | 삽입 시점 | 화면에서의 역할 | 개별 프롬프트 (공통 스타일 뒤에 붙인다) |
|---|---|---|---|
| `ai_inspect_1` | **0:00–0:09** 오프닝 · **1:11–1:24** STEP 02 대체 | 풀블리드 배경, 좌측 밝은 워시 위에 글자 | `A Korean construction professional in a white safety helmet and navy hi-vis vest holding a tablet, inspecting an apartment building exterior wall, mid-shot from slightly below, blue sky, subject on the right third of the frame` |
| `ai_city_1` | **0:21–0:25** 260만 세대 카운트업 배경 | 딥블루 면 위에 46% 로 깔린다 | `Wide aerial view of a modern Korean apartment complex district in clear daylight, many high-rise residential towers, orderly urban grid, calm blue tone, no people` |
| `ai_engineer_1` | **0:26–0:31** 현장 진단 | 풀블리드, 좌측 워시 위에 키워드 4개 | `Two Korean engineers in safety helmets examining a large blueprint on a site table, pointing at a detail, bright outdoor daylight, apartment building softly blurred behind, subjects on the right half` |
| `ai_concrete_1` | **0:14–0:18** 프로세스 04 '실제 시공' | 세로 카드 (약 3:4) | `Korean construction workers pouring and finishing concrete on a building slab, vertical composition, bright daylight, safety helmets and vests, realistic tools, dust-free clean site` |
| `ai_meeting_1` | **1:03–1:11** STEP 01 본사 미팅 | 풀블리드, 우측 워시 위에 글자 | `Korean business people and engineers reviewing drawings around a bright meeting room table, large window with daylight, laptops and printed drawings, subjects on the left half of the frame` |
| `ai_team_1` | **0:57–1:02** 60명 전문 인력 | 우측 740px 세로 띠, 55% 로 깔린다 | `A group of Korean construction and engineering professionals standing together in a bright office, mixed roles (site helmet, office attire), confident and natural expressions, vertical composition` |
| `ai_result_1` | **1:25–1:35** 결론 | 풀블리드, 56% + 딥블루 베일 | `A completed modern Korean apartment building exterior in bright daylight, clean facade, low-angle wide shot, blue sky, no people, no text on the building` |

---

## 2. 실물 원본이어야 하는 자산 (AI 대체 금지)

| 슬롯 | 내용 | 등장 | 비고 |
|---|---|---|---|
| `pour_logo` | **POUR 로고 원본** | 1:40–1:46 엔딩 | 현재는 영상 내내 쓰는 워드마크를 크게 조판해 대신하고 있다. 투명 배경 PNG/SVG, 가로 1400px 이상 |
| `mou_doc` | POUR공법 특허 사용 MOU 체결서 | 1:21–1:25 | 없으면 체결 사실만 조판해 보여준다. 글자·로고·도장 수정 금지 |
| `netform_doc` | NETFORM 공사 후 공문 | 0:50대 | 글자·로고·도장 수정 금지 |
| `material_2~4` | POUR 자재 추가 컷 | 0:37 | 라벨·색상·형태·제품명 변경 금지. 누끼(투명 PNG) 권장 |
| `cad_1` | CAD 도면 | 0:14 · 0:44 | 실제 도면 |
| `handshake` | 협약 체결 악수 | 1:23 | 실사진 권장 |

---

## 3. 실사진이 있으면 좋은 자산 (없으면 AI 대체 허용)

| 슬롯 | 내용 | 등장 | AI 대체 |
|---|---|---|---|
| `apt_wide_1` | 전국 아파트 현장 와이드 | 0:24–0:26 | `ai_city_1` |
| `hq_meeting` | POUR 본사 미팅 | 1:03 | `ai_meeting_1` |
| `site_visit` | 시공사 방문 · 현장 확인 | 1:11 | `ai_inspect_1` |
| `analysis_1` | 현장 조건 분석 | 0:10 | `ai_engineer_1` |
| `construction_1` | 실제 시공 | 0:14 | `ai_concrete_1` |
| `drone_1` `drone_2` | 드론 외벽진단 | 0:47–0:55 | — |
| `data_1` `ai_1` `review_1` | 현장 데이터 / AI 분석 / 기술검토 | 0:47–0:55 | — |
| `seminar_2` `seminar_3` | 설명회 추가 컷 | 0:40 | — |
| `diag_1` `meet_1` `kakao_1` `rooftop_1` | 진단 / 미팅 / 소통 / 옥상 | 0:50대 | — |

---

## 4. 자동 대체 규칙

`slot()` 에 배열을 주면 **앞에서부터 먼저 확보된 것**을 쓴다.

| 자리 | 1순위 (실사) | 2순위 (AI) |
|---|---|---|
| 오프닝 배경 | `ai_inspect_1` | `apt_wide_1` |
| 카운트업 배경 | `ai_city_1` | `apt_wide_1` |
| 전국 현장 와이드 | `apt_wide_1` | `ai_city_1` |
| 현장 진단 | `ai_engineer_1` | `drone_1` |
| STEP 01 | `hq_meeting` | `ai_meeting_1` |
| STEP 02 | `site_visit` | `ai_inspect_1` |
| 프로세스 01 | `analysis_1` | `ai_engineer_1` |
| 프로세스 04 | `construction_1` | `ai_concrete_1` |

---

## 5. 파일 규격

- 배경용(`apt_wide_1`, `ai_*`, `drone_1`, `factory_yongin`): 가로 **2400px 이상**, 16:9 근사
- 세로 카드용(`ai_concrete_1`, `analysis_1`, `construction_1`): 세로 **1600px 이상**, 3:4 근사
- 문서(`mou_doc`, `netform_doc`, `cad_1`): 정면 스캔, 그림자·기울기 없이, 짧은 변 **1600px 이상**
- 자재(`material_*`): 투명 배경 PNG 권장. 불투명이면 렌더 시 자동으로 흰 받침대가 붙는다
- 로고(`pour_logo`): 투명 배경 PNG 또는 SVG, 가로 **1400px 이상**

## 6. 확인 방법

```bash
PHLABEL=1 node render.js      # 어느 자리가 비었는지 라벨을 켜고 렌더
node phscan.js                # 최종본에 자리표시자 문구가 남았는지 검사
node contrast.js              # 모든 글자의 실제 배경 대비 명암비
node holdcheck.js             # 핵심 텍스트가 완전 불투명으로 머무는 시간
node density.js               # 안전영역 안 콘텐츠 밀도
node audit.js  node subcheck.js
```
