# 입주민 설명자료 자동 제작 프로그램 (resident-ppt-automation)

같은 공종의 기존 PowerPoint 자료 2~3개를 분석하여, 회사 정보·기존 현장 정보를 모두 제거하고
새 아파트명이 적용된 **입주민용 설명자료 1개**를 자동으로 생성하는 프로그램입니다.

기존 PPT 슬라이드를 그대로 이어붙이는 병합 프로그램이 아닙니다. 각 PPT를 사진·문구·표·공법
순서 등 **요소 단위로 분해**하고, 회사/현장 식별 정보를 제거한 뒤, 새로운 A4 세로형 레이아웃으로
다시 구성합니다.

## 1. 폴더 구조

```
app/
  main.py            파이프라인 오케스트레이터 + CLI
  ui/gui.py           CustomTkinter GUI
  ppt_parser/          PPT 슬라이드/도형 분석
  image_extractor/     이미지 추출 + OCR + 해시
  anonymizer/          회사/현장/개인정보 탐지 및 제거
  image_classifier/    이미지 분류/중복 제거/전후 관계 탐지
  content_selector/    콘텐츠 선별 + 공법 순서 교차 검증
  slide_planner/       슬라이드 구조(8~12p) 계획
  ppt_generator/       PPTX 렌더링 (A4 세로, 남색/흰색/회색/금색)
  validator/           결과물 자동 검수 + 자동 수정
  utils/                설정값, 데이터 모델
tests/
  make_samples.py      테스트용 가짜 PPT 샘플 생성기
output/                 결과물 저장 기본 폴더
temp/                    임시 작업 폴더 (원본 미수정, 항상 복사본 사용)
build_exe.ps1            Windows EXE 빌드 스크립트
run_app.py                GUI 실행 진입점(EXE 빌드 대상)
```

## 2. 설치

```bash
pip install -r requirements.txt
```

추가로 다음 두 프로그램이 설치되어 있으면 기능이 완전해집니다(없어도 PPTX 생성 자체는 정상 동작).

- **Tesseract-OCR** (한국어 데이터 포함) — 사진 안에 삽입된 아파트명/회사명/전화번호 등을 탐지하기 위해 사용
- **LibreOffice** — PDF 미리보기 및 미리보기 이미지 생성에 사용

## 3. 실행 방법

### GUI로 실행
```bash
python run_app.py
```
1. 새 아파트명 입력
2. 공종 선택(재도장/방수/보수·보강/아스콘/기타)
3. 기존 PPT 2~3개 추가(드래그 앤 드롭 또는 파일 선택)
4. 출력 폴더 지정
5. "새 설명자료 만들기" 클릭 → 진행 단계가 표시되며 완료 후 결과 파일/폴더 열기 가능

### CLI로 실행
```bash
python -m app.main --apt "은하수아파트" --work 재도장 --output ./output file1.pptx file2.pptx [file3.pptx]
```

## 4. 중간 산출물 (PPTX 생성 전 검증용)

최종 PPT를 만들기 전에 `output/[아파트명]_중간산출물/` 폴더에 아래 자료를 먼저 저장하여,
사진·문구 선별 과정을 검증할 수 있게 한다.

- `이미지추출/` — PPT별 추출된 전체 이미지(배제/중복 사유가 파일명에 표시됨)
- `이미지분류.csv` — 이미지별 카테고리, 배제 여부/사유, 중복 여부, 실제 캡션
- `최종후보이미지목록.csv` — 섹션별 최종 선정 이미지
- `슬라이드계획.json` — 최종 슬라이드 구조 계획
- `extracted_text.csv` — 원본 PPT의 모든 문구, 용도 분류, 민감정보 여부, 사용 가능 여부
- `content_library.json` — 용도별로 정리된 실제 원본 문구 라이브러리
- `slide_content_mapping.csv` — 결과 슬라이드별로 어떤 원본 PPT/슬라이드의 사진·문구를 사용했는지 추적표

## 5. 결과물

- `[아파트명]_[공종]_입주민설명자료.pptx` — 최종 PowerPoint (A4 세로형)
- `[아파트명]_[공종]_입주민설명자료.pdf` — PDF 미리보기 (LibreOffice 필요)
- `[아파트명]_미리보기.png` — 전체 슬라이드 축소 미리보기 이미지
- `[아파트명]_처리로그.txt` — 처리 단계 로그 (슬라이드/이미지/텍스트 집계 포함)
- `[아파트명]_검수결과.txt` — 자동 검수 결과 보고서

## 6. 파이프라인 개요

1. PPT 2~3개를 임시 작업 폴더에 복사(원본 절대 수정 안 함) 후 분석
2. 모든 사진/텍스트를 요소 단위로 추출
3. 텍스트 런 + 이미지 OCR 결과를 스캔하여 기존 아파트명/회사명/전화번호/이메일/URL/사업자번호/
   담당자 이름 패턴 등의 블랙리스트 구성 → 해당 정보가 포함된 사진·문구는 결과물에서 배제
4. perceptual hash로 중복/유사 사진 제거
5. 같은 슬라이드 내에서 "시공전/시공후" 라벨이 함께 있는 경우에만 전후 사진 쌍으로 인정
   (다른 슬라이드/다른 파일 사진끼리는 절대 연결하지 않음)
6. 표준 공법 순서(사전점검→고압세척→균열보수/퍼티→하도→중도→상도→최종점검) 중 입력 PPT에
   실제로 존재가 확인된 단계만 채택. 자료 간 표기가 다르면 "사용자 확인 필요"로 표시
7. 새로운 A4 세로형 슬라이드 구조로 재구성(사진 중심, 남색/흰색/회색/금색)
8. 저장 전 자동 검수(민감정보 잔존 여부, 슬라이드 이탈 요소, 중복 사진, 세로형 여부 등) 및
   가능한 항목은 자동 수정, 불가능한 항목은 검수 보고서에 기록

## 7. 테스트

```bash
python tests/make_samples.py   # 회사/현장 정보가 섞인 가짜 PPT 2~3개 생성
python -m app.main --apt "테스트아파트" --work 재도장 --output ./output \
    tests/fixtures/sample1.pptx tests/fixtures/sample2.pptx tests/fixtures/sample3.pptx
```

## 8. EXE 빌드 (Windows)

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
.\build_exe.ps1
```
결과: `dist\ResidentPPTMaker\ResidentPPTMaker.exe`

## 9. 한계 및 주의사항

`USER_GUIDE.md`의 "아직 자동 판별이 어려운 항목"을 참고하세요. 이미지 분류와 회사/현장 정보
탐지는 텍스트(OCR 포함) 기반 규칙과 지각적 해시에 의존하며, 판별이 불확실한 요소는 자동으로
배제하는 것을 기본 원칙으로 합니다.
