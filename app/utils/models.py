# -*- coding: utf-8 -*-
"""파이프라인 전체에서 공유하는 데이터 구조."""
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class TextRun:
    source_file: str
    slide_index: int
    shape_name: str
    text: str
    is_title: bool = False


@dataclass
class ImageAsset:
    id: str
    source_file: str
    slide_index: int
    shape_name: str
    path: str                      # 임시 작업 폴더에 추출된 이미지 경로
    width: int
    height: int
    phash: Optional[str] = None
    ocr_text: str = ""
    nearby_text: str = ""          # 같은 슬라이드의 제목/본문 텍스트
    category: str = "기타"
    banned: bool = False
    banned_reasons: List[str] = field(default_factory=list)
    is_duplicate_of: Optional[str] = None
    quality_score: float = 0.0
    ba_role: Optional[str] = None  # "before" / "after" / None
    ba_group: Optional[str] = None  # 같은 슬라이드 내 전후 쌍 식별자
    left: int = 0
    top: int = 0
    real_caption: Optional[str] = None  # 같은 슬라이드의 실제 원본 문구에서 뽑은 캡션(익명화 완료)
    confidence: float = 0.0     # v2 엔진: 카테고리 분류 신뢰도(0~1)
    selected: bool = False      # v2 엔진: 최종 결과물에 실제로 삽입되었는지
    selected_slide: Optional[int] = None  # v2 엔진: 삽입된 결과 슬라이드 번호(1-base)
    group_id: Optional[str] = None  # v2 엔진: 소속된 콘텐츠 그룹(공정/사건 단위) id
    caption_is_original: bool = False  # v2 엔진: 캡션이 원본 문구 기반인지(품질 점수용)
    grade: str = "B"            # v2 엔진: A(핵심 필수) / B(선택적 활용) / C(제외 대상)
    grade_reason: str = ""      # v2 엔진: C등급 판정 사유(로그/CSV 기록용)


@dataclass
class SlideRecord:
    source_file: str
    index: int
    is_portrait: bool
    title_text: str
    all_text: str
    image_ids: List[str] = field(default_factory=list)
    has_before_after_labels: bool = False


@dataclass
class ProcessStep:
    name: str
    keywords_matched: List[str]
    files_confirmed: List[str]
    image_ids: List[str] = field(default_factory=list)
    description: str = ""
    needs_user_confirmation: bool = False


@dataclass
class BeforeAfterPair:
    before_image_id: str
    after_image_id: str
    source_file: str
    slide_index: int
    process_image_ids: List[str] = field(default_factory=list)


@dataclass
class ContentPlan:
    apartment_name: str
    work_type: str
    cover_image_id: Optional[str]
    defect_image_ids: List[str]
    method_image_ids: List[str]
    feature_image_ids: List[str]
    process_steps: List[ProcessStep]
    ba_pairs: List[BeforeAfterPair]
    effect_image_ids: List[str]
    warnings: List[str] = field(default_factory=list)
    gallery_image_ids: List[str] = field(default_factory=list)
    method_items: List[str] = field(default_factory=list)
    feature_items: list = field(default_factory=list)
    effect_items: List[str] = field(default_factory=list)
    reason_note: str = ""
    case_notes: list = field(default_factory=list)
