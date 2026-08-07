# -*- coding: utf-8 -*-
"""
결과물 품질을 100점 만점으로 자동 평가한다.

[재설계, 2026-08] "사진/문구를 최대한 많이 담았는가"가 아니라 "사진과 문구가 같은
페이지 안에서 결합된 완성형 자료인가"를 최우선으로 평가한다. 페이지 수가 과도하거나,
사진만/문구만 있는 페이지가 있거나, 제목이 불필요하게 중복되면 총점과 무관하게 FAIL 처리한다.
총점 85점 미만이면 최종 저장하지 않고 재구성 신호를 반환한다.
"""
from dataclasses import dataclass, field
from typing import Dict, List

from app.utils.config import BANNED_GENERIC_PHRASES

MAX_TOTAL_PAGES = 14
MAX_PROCESS_PAGES = 2


@dataclass
class QualityReport:
    scores: Dict[str, float] = field(default_factory=dict)
    total: float = 0.0
    passed: bool = False
    fail_reasons: List[str] = field(default_factory=list)
    metrics: Dict[str, float] = field(default_factory=dict)


# case: 전후 비교는 사진이 곧 메시지라 문구가 없어도 괜찮다.
# site_photos: 사용자가 추가한 현장사진은 AI가 임의 판단 문구를 붙이지 않는 것이
# 원칙이므로(요청사항), 캡션 없이 사진만 있어도 "사진만 있는 페이지" 위반으로 보지 않는다.
_PHOTO_ONLY_EXEMPT = ("case", "site_photos")


def _is_photo_only(p) -> bool:
    return bool(p.get("images")) and not p.get("bullets") and p["type"] not in _PHOTO_ONLY_EXEMPT


def _is_text_only(p) -> bool:
    return bool(p.get("bullets")) and not p.get("images") and p["type"] not in ("cover", "closing", "case")


def _is_combined(p) -> bool:
    if p["type"] in _PHOTO_ONLY_EXEMPT:
        return True
    if p["type"] in ("cover", "closing"):
        return True
    return bool(p.get("images")) and bool(p.get("bullets"))


def compute_quality(images: List, pages: List[dict], content_library: Dict[str, List[str]],
                     used_original_phrases: set, validation_report) -> QualityReport:
    q = QualityReport()

    total_pages = len(pages)
    q.metrics["total_pages"] = total_pages
    content_pages = [p for p in pages if p["type"] not in ("cover", "closing")]

    # ---------- 1. 페이지 수 적정성 (15점) : 권장 8~12, 최대 14 ----------
    if 8 <= total_pages <= 12:
        page_score = 15.0
    elif 7 <= total_pages <= 14:
        page_score = 11.0
    else:
        page_score = 3.0
    q.scores["page_count_adequacy"] = page_score

    # ---------- 2. 사진+문구 결합 페이지 비율 (20점) ----------
    combined_pages = [p for p in content_pages if _is_combined(p)]
    combined_ratio = (len(combined_pages) / len(content_pages)) if content_pages else 1.0
    q.metrics["combined_page_count"] = len(combined_pages)
    q.metrics["photo_text_pages_ratio"] = round(combined_ratio, 3)
    q.scores["photo_text_combination"] = round(combined_ratio * 20, 2)

    # ---------- 3. 사진만 있는 페이지 없음 (10점, case 제외) ----------
    photo_only_pages = [p for p in content_pages if _is_photo_only(p)]
    q.metrics["photo_only_page_count"] = len(photo_only_pages)
    q.scores["no_photo_only_pages"] = 10.0 if len(photo_only_pages) == 0 else \
        (5.0 if len(photo_only_pages) == 1 else 0.0)

    # ---------- 4. 문구만 있는 페이지 없음 (10점, 표지/마무리 제외) ----------
    text_only_pages = [p for p in content_pages if _is_text_only(p)]
    q.metrics["text_only_page_count"] = len(text_only_pages)
    q.scores["no_text_only_pages"] = 10.0 if len(text_only_pages) == 0 else 0.0

    # ---------- 5. 사진-문구 의미 연결성 (15점) ----------
    valid_images = [i for i in images if not i.banned and not i.is_duplicate_of]
    selected_images = [i for i in valid_images if i.selected]
    original_caption_count = sum(1 for i in selected_images if i.caption_is_original)
    relevance = (original_caption_count / len(selected_images)) if selected_images else 1.0
    q.metrics["caption_relevance"] = round(relevance, 3)
    q.scores["caption_relevance"] = round(relevance * 15, 2)

    # ---------- 6. 원본 문구 활용률 (10점, 참고 지표로 축소) ----------
    important_phrases = set()
    for key, phrases in content_library.items():
        if key.startswith("_"):
            continue
        important_phrases.update(phrases)
    text_util = (len(used_original_phrases & important_phrases) / len(important_phrases)) \
        if important_phrases else 1.0
    q.metrics["text_utilization"] = round(text_util, 3)
    q.scores["text_utilization"] = round(min(text_util / 0.4, 1.0) * 10, 2)

    # (참고용 지표: 더 이상 배점에 직접 반영하지 않음 - 사진 100% 활용은 목표가 아님)
    photo_util = (len(selected_images) / len(valid_images)) if valid_images else 1.0
    q.metrics["photo_utilization"] = round(photo_util, 3)

    # ---------- 7. 중복 제목 없음 (5점) ----------
    titles = [p["title"] for p in pages]
    dup_titles = len(titles) - len(set(titles))
    q.metrics["duplicate_title_count"] = dup_titles
    q.scores["no_duplicate_titles"] = 5.0 if dup_titles == 0 else 0.0

    # ---------- 8. 같은 공정 페이지 분산 방지 (5점) ----------
    process_page_count = sum(1 for p in pages if p["type"] == "process")
    q.metrics["process_page_count"] = process_page_count
    q.scores["process_dispersion"] = 5.0 if process_page_count <= MAX_PROCESS_PAGES else 0.0

    # ---------- 9. 민감정보 미검출 (5점) ----------
    leaked = any("민감" in m or "잔존" in m for m in getattr(validation_report, "manual_review", []))
    q.scores["sensitive_info"] = 0.0 if leaked else 5.0

    # ---------- 10. 렌더링 품질(레이아웃/텍스트 겹침·잘림·과밀) (5점) ----------
    overlap_flag = any("겹침" in m for m in getattr(validation_report, "manual_review", []))
    truncation_flag = any("잘림" in m or "확대" in m for m in
                            getattr(validation_report, "manual_review", []))
    q.scores["render_quality"] = 0.0 if overlap_flag else (2.5 if truncation_flag else 5.0)

    q.total = round(sum(q.scores.values()), 2)
    q.passed = q.total >= 85.0

    # ---------- 하드 FAIL 조건 (총점과 무관하게 실패 처리) ----------
    if total_pages > MAX_TOTAL_PAGES:
        q.fail_reasons.append(f"전체 페이지 {total_pages}장 (기준 {MAX_TOTAL_PAGES}장 초과)")
    if len(photo_only_pages) >= 2:
        q.fail_reasons.append(f"사진만 있는 페이지 {len(photo_only_pages)}장 (기준 2장 이상 금지)")
    if len(text_only_pages) >= 1:
        q.fail_reasons.append(f"문구만 있는 페이지 {len(text_only_pages)}장 존재 (표지/마무리 제외 금지)")
    if dup_titles > 0:
        q.fail_reasons.append(f"중복 제목 {dup_titles}건")
    if process_page_count > MAX_PROCESS_PAGES:
        q.fail_reasons.append(f"시공 순서 페이지 {process_page_count}장으로 분산됨 (기준 {MAX_PROCESS_PAGES}장 이하)")
    if leaked:
        q.fail_reasons.append("민감정보 잔존 의심")
    if overlap_flag:
        q.fail_reasons.append("텍스트 겹침 발생 - 페이지 레이아웃을 확인해야 함")
    generic_hits_check = [b for p in pages for b in p.get("bullets", [])
                           if any(g in b for g in BANNED_GENERIC_PHRASES)]
    if generic_hits_check:
        q.fail_reasons.append(f"일반 문구(의미 없는 상투어) {len(generic_hits_check)}건")

    if q.fail_reasons:
        q.passed = False  # 명시적 실패 조건이 있으면 총점과 무관하게 실패 처리

    return q


def report_text(q: QualityReport) -> str:
    lines = ["=== 품질 점수 (100점 만점) ===", ""]
    labels = {
        "page_count_adequacy": "페이지 수 적정성(15점)",
        "photo_text_combination": "사진-문구 결합 페이지 비율(20점)",
        "no_photo_only_pages": "사진만 있는 페이지 없음(10점)",
        "no_text_only_pages": "문구만 있는 페이지 없음(10점)",
        "caption_relevance": "사진-문구 의미 연결성(15점)",
        "text_utilization": "원본 문구 활용률(10점)",
        "no_duplicate_titles": "중복 제목 없음(5점)",
        "process_dispersion": "시공 순서 페이지 집중도(5점)",
        "sensitive_info": "민감정보 검증(5점)",
        "render_quality": "렌더링 품질(5점)",
    }
    for key, label in labels.items():
        lines.append(f"  {label}: {q.scores.get(key, 0):.1f}")
    lines.append("")
    lines.append(f"총점: {q.total:.1f} / 100  ->  {'PASS' if q.passed else 'FAIL'}")
    if q.fail_reasons:
        lines.append("\n[실패 사유]")
        for r in q.fail_reasons:
            lines.append(f"  - {r}")
    lines.append("\n[측정 지표]")
    for k, v in q.metrics.items():
        lines.append(f"  {k}: {v}")
    return "\n".join(lines)
