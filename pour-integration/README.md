# POUR 공고 입력 개선 모듈 (작업 중)

「한솔 공사실적 통합관리」 사이트에 붙일 독립 모듈입니다.
대상 사이트의 소스를 아직 확보하지 못해, 소스에 의존하지 않는 순수 로직부터
먼저 구현하고 있습니다. 소스가 준비되면 기존 입력칸에 연결만 하면 됩니다.

## 현재 포함된 것

| 파일 | 내용 |
|---|---|
| `regions.data.js` | 전국 시·도 / 시·군·구 매핑 데이터 (행정안전부 법정동 코드, 기준일 2026-07-30) |
| `pour-region.js` | 「지역·도시」 통합 입력 해석기 |

## `pour-region.js` 사용법

```js
PourRegion.parse("하남");      // { status:"resolved", region:"경기", city:"하남" }
PourRegion.parse("금산군");    // { status:"resolved", region:"충남", city:"금산" }
PourRegion.parse("서울 강남"); // { status:"resolved", region:"서울", city:"강남" }
PourRegion.parse("중구");      // { status:"ambiguous", candidates:[서울 중구, 부산 중구, ...] }
PourRegion.parse("없는동네");  // { status:"notfound" }

PourRegion.suggest("하");      // 입력 중 추천 목록 (최대 10개)
PourRegion.format("경기","하남"); // "경기 하남"
```

화면에는 한 칸만 두되, 저장할 때는 기존 구조 그대로 `region` 과 `city` 를 나누어
저장합니다. 기존에 저장된 자료는 `format(region, city)` 로 합쳐서 표시합니다.

여러 시도에 같은 이름이 있는 경우(`중구`, `동구`, `서구`, `남구`, `북구`, `강서`, `고성`)
임의로 확정하지 않고 `status:"ambiguous"` 로 선택 목록을 돌려줍니다.

## 데이터 갱신

`regions.data.js` 는 행정안전부 법정동 코드에서 생성한 데이터 파일입니다.
시·군·구 개편이 있을 때만 갱신하세요. 광주광역시와 전라남도는 원본 데이터에서
통합 시도로 관리되어, 자치구는 `광주`, 시·군은 `전남` 으로 나누어 표기합니다.

## 남은 작업

- 엑셀(.xlsx/.xls/.csv) 업로드 및 열 이름 자동 인식
- 특허번호 정규화 및 저장소(중복 시 갱신)
- 특허번호·특허명 자동완성 위젯
- 공종 자동 분류 및 칩 UI
