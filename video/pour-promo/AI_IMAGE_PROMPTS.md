# AI 실사 이미지 생성 프롬프트 — POUR 홍보영상 v9

이 프로젝트는 이미지를 직접 생성하지 않습니다. 아래 프롬프트로 이미지를 만든 뒤
**파일명을 슬롯 이름 그대로** 지정해 `assets/` 에 넣고 다시 렌더링하면 자동 반영됩니다.
(예: `ai_city_1.jpg`) 파일이 없는 자리는 무엇이 필요한지 표기된 플레이스홀더로 남습니다.

## 공통 스타일 (모든 프롬프트 뒤에 붙일 것)

```
Korean modern construction and architecture, natural premium commercial photography,
bright soft daytime natural light, blue / white / light grey color palette,
corporate brochure quality conveying professionalism and trust,
realistic people and architectural textures, clean composed framing,
shallow depth of field, high resolution, photorealistic
```

## 공통 네거티브 (반드시 함께 사용)

```
dark cinematic lighting, heavy orange or yellow color cast, teal-and-orange grade,
futuristic or sci-fi city, unrealistic architecture, deformed hands, distorted faces,
extra fingers, broken equipment, warped structures, overly staged stock photo look,
generated text, letters, signage, logos, watermarks, captions, subtitles,
low resolution, oversaturated, HDR halo, fisheye distortion
```

---

## 1. `ai_city_1` — 도시 · 건축물 전경

- **비율 16:9** · 권장 2560×1440 이상
- **삽입 위치** SCENE 2 카운트업 **0:21–0:25** (배경, 불투명도 22%)
- 딥블루 위에 옅게 깔리므로 **하늘과 건물 실루엣의 대비가 명확한 컷**이 좋습니다.

```
Wide aerial view of a modern Korean apartment complex district in clear daytime,
clean high-rise residential towers with light grey and white facades,
organized landscaping and wide roads between buildings, calm blue sky with soft clouds,
slightly elevated drone perspective, balanced horizon, no people in focus
```

## 2. `ai_inspect_1` — 태블릿으로 현장을 점검하는 건설 전문가

- **비율 16:9** · 권장 2560×1440 이상 (배경 전체로 사용)
- **삽입 위치** SCENE 1 도입 **0:00–0:09** (배경 전체 · 좌측 밝은 워시) / SCENE 4 STEP 02 대체
- 좌측이 흰 면으로 덮이므로 **인물과 주요 피사체가 화면 오른쪽에 오는 구도**가 좋습니다.

```
A Korean construction professional in a clean light grey work jacket and white safety helmet,
holding a tablet and reviewing building exterior condition on an apartment rooftop,
bright overcast daylight, modern residential building surfaces in the background,
calm confident expression, three-quarter view facing left, waist-up framing
```

## 3. `ai_engineer_1` — 현장 조건과 공법을 분석하는 엔지니어

- **비율 16:9** · 권장 2560×1440 이상 (배경 전체로 사용)
- **삽입 위치** SCENE 2 현장진단 **0:29–0:34** (배경 전체 · 좌측 밝은 워시) / SCENE 1 프로세스 01 대체

```
A Korean structural engineer studying exterior wall condition data,
standing beside a building facade with a clipboard and measuring device,
bright natural daylight, light grey concrete and blue-tinted glass surfaces,
focused professional expression, clean modern construction environment, medium shot
```

## 4. `ai_meeting_1` — 밝은 회의실 도면 검토

- **비율 16:9** · 권장 2560×1440 이상 (배경 전체로 사용)
- **삽입 위치** SCENE 4 STEP 01 **1:05–1:12** (배경 전체 · 우측 밝은 워시)
- 우측이 흰 면으로 덮이므로 **인물이 화면 왼쪽에 오는 구도**가 좋습니다.

```
Four Korean construction company professionals in business casual reviewing
large architectural drawings spread on a white meeting table,
bright modern meeting room with floor-to-ceiling windows and soft daylight,
light wood and white interior, laptops and printed documents,
collaborative discussion, natural candid moment, wide medium shot
```

## 5. `ai_concrete_1` — 콘크리트 타설 · 구조 작업

- **비율 3:2 가로** · 권장 1800×1200 이상
- **삽입 위치** SCENE 1 프로세스 04 '실제 시공' 대체 / 3-5 '공사 중' 대체

```
Korean construction workers in clean safety gear performing waterproof coating
work on a building rooftop, fresh light grey surface being applied with rollers,
bright clear daytime, orderly equipment and material containers,
realistic work textures, safe and organized site, medium wide shot
```

## 6. `ai_team_1` — 여러 분야 현장 전문가 협업

- **비율 3:4 세로** · 권장 1200×1600 이상
- **삽입 위치** 3-6 60명 전문 인력 **1:08–1:14** (우측 배경, 740×1080, 불투명도 55%)
- 우측에 세로로 깔리고 좌측으로 갈수록 흐려지므로 **인물이 오른쪽에 모인 구도**가 좋습니다.

```
A diverse team of Korean construction specialists collaborating on site,
engineer, site manager and technician reviewing plans together,
bright natural daylight, modern building under maintenance in the background,
white helmets and light grey work wear, natural interaction,
vertical composition with the group positioned toward the right
```

## 7. `ai_result_1` — 완성된 현대식 건축물 · 성과

- **비율 16:9** · 권장 2560×1440 이상
- **삽입 위치** SCENE 5 클라이맥스 **1:26–1:40** (배경, 불투명도 30%)
- 딥블루 위 옅은 배경이므로 **하단이 밝고 상단이 정돈된 컷**이 자막 가독성에 유리합니다.

```
Completed modern Korean apartment complex in soft late-morning light,
freshly maintained exterior walls with clean white and light grey finish,
wide establishing shot from ground level looking slightly upward,
clear blue sky, well-kept landscaping, sense of completion and quality,
no people, calm balanced composition
```

---

## 삽입 후 확인 사항

1. `node render.js` 재실행 — 파일명만 맞으면 자동 배치됩니다.
2. 인물 사진은 얼굴·손 왜곡을 반드시 육안 확인하세요.
3. 이미지 안에 **글자·로고·워터마크가 생성되지 않았는지** 확인하세요.
4. `npm run audit` 로 자막 겹침·안전여백을 재점검하세요.
5. `node luma.js` 로 딥블루 비중이 35~40%를 유지하는지 확인하세요.

## 자동 대체 규칙

일부 자리는 **실사 우선 → AI 이미지 대체** 순으로 동작합니다.

| 자리 | 1순위(실사) | 2순위(AI) |
|---|---|---|
| SCENE 1 프로세스 01 | `analysis_1` | `ai_engineer_1` |
| SCENE 1 프로세스 04 | `construction_1` | `ai_concrete_1` |
| SCENE 2 현장진단 | `ai_engineer_1` | `drone_1` |
| 3-5 공사 중 | `rooftop_1` | `ai_concrete_1` |
| SCENE 4 STEP 01 | `hq_meeting` | `ai_meeting_1` |
| SCENE 4 STEP 02 | `site_visit` | `ai_inspect_1` |

실제 현장 사진이 들어오면 AI 이미지는 자동으로 물러납니다.
