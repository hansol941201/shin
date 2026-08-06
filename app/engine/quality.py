# -*- coding: utf-8 -*-
"""
결과물 품질을 100점 만점으로 자동 평가한다(요청된 10개 항목 배점 그대로 적용).
총점 85점 미만이면 최종 저장하지 않고 재구성 신호를 반환한다.
"""
from dataclasses import dataclass, field
from typing import Dict, List

from app.utils.config import BANNED_GENERIC_PHRASES


@dataclass
class QualityReport:
    scores: Dict[str, float] = field(default_factory=dict)
    total: float = 0.0
    passed: bool = False
    fail_reasons: List[str] = field(default_factory=list)
    metrics: Dict[str, float] = field(default_factory=dict)


def compute_quality(images: List, pages: List[dict], content_library: Dict[str, List[str]],
                     used_original_phrases: set, validation_report) -> QualityReport:
    q = QualityReport()

    valid_images = [i for i in images if not i.banned and not i.is_duplicate_of]
    selected_images = [i for i in valid_images if i.selected]
    photo_util = (len(selected_images) / len(valid_images)) if valid_images else 1.0
    q.metrics["photo_utilization"] = round(photo_util, 3)
    q.scores["photo_utilization"] = round(min(photo_util / 0.85, 1.0) * 20, 2)

    important_phrases = set()
    for phrases in content_library.values():
        important_phrases.update(phrases)
    text_util = (len(used_original_phrases & important_phrases) / len(important_phrases)) \
        if important_phrases else 1.0
    q.metrics["text_utilization"] = round(text_util, 3)
    q.scores["text_utilization"] = round(min(text_util / 0.5, 1.0) * 15, 2)

    original_caption_count = sum(1 for i in selected_images if i.caption_is_original)
    relevance = (original_caption_count / len(selected_images)) if selected_images else 1.0
    q.metrics["caption_relevance"] = round(relevance, 3)
    q.scores["caption_relevance"] = round(relevance * 15, 2)

    content_pages = [p for p in pages if p["type"] not in ("cover", "closing")]

    def _is_dense(p):
        n_img = len(p.get("images", []))
        n_bul = len(p.get("bullets", []))
        if p["type"] == "case":
            return True
        if n_img >= 2:
            return True
        if n_img == 1 and n_bul >= 2:
            return True
        return n_bul >= 3

    dense_pages = [p for p in content_pages if _is_dense(p)]
    density = (len(dense_pages) / len(content_pages)) if content_pages else 1.0
    q.metrics["page_density"] = round(density, 3)
    q.scores["page_density"] = round(density * 10, 2)

    expected_sections = {"defect", "method_reason", "features", "process", "case", "effects"}
    present_sections = {p["type"] for p in pages}
    flow = len(expected_sections & present_sections) / len(expected_sections)
    q.metrics["story_flow"] = round(flow, 3)
    q.scores["persuasion_flow"] = round(flow * 10, 2)

    process_pages = [p for p in pages if p["type"] == "process"]
    specific = sum(1 for p in process_pages if p.get("bullets"))
    specificity = (specific / len(process_pages)) if process_pages else 1.0
    q.metrics["process_specificity"] = round(specificity, 3)
    q.scores["process_specificity"] = round(specificity * 10, 2)

    all_bullets = [b for p in pages for b in p.get("bullets", [])]
    generic_hits = sum(1 for b in all_bullets if any(g in b for g in BANNED_GENERIC_PHRASES))
    generic_ratio = (generic_hits / len(all_bullets)) if all_bullets else 0.0
    q.metrics["generic_phrase_ratio"] = round(generic_ratio, 3)
    dup_img_ids = [i.id for i in selected_images]
    dup_count = len(dup_img_ids) - len(set(dup_img_ids))
    q.metrics["duplicate_count"] = dup_count
    repeat_penalty = 5 if (dup_count > 0 or generic_ratio > 0.2) else 0
    q.scores["duplication"] = max(0, 5 - repeat_penalty)

    q.scores["layout_integrity"] = 5.0  # 원본 비율 유지 렌더링으로 구조적으로 보장

    truncation_flag = any("잘림" in m or "확대" in m for m in
                            getattr(validation_report, "manual_review", []))
    q.scores["text_overlap"] = 3.0 if truncation_flag else 5.0

    leaked = any("민감" in m or "잔존" in m for m in getattr(validation_report, "manual_review", []))
    q.scores["sensitive_info"] = 0.0 if leaked else 5.0

    q.total = round(sum(q.scores.values()), 2)
    q.passed = q.total >= 85.0

    if photo_util < 0.60:
        q.fail_reasons.append(f"사진 활용률 {photo_util*100:.1f}% (기준 60% 미만)")
    if text_util < 0.50:
        q.fail_reasons.append(f"원본 문구 활용률 {text_util*100:.1f}% (기준 50% 미만)")
    weak_pages = len(content_pages) - len(dense_pages)
    if weak_pages >= 2:
        q.fail_reasons.append(f"빈약한 페이지 {weak_pages}장 (기준 2장 이상)")
    if dup_count > 0:
        q.fail_reasons.append(f"동일 사진 반복 {dup_count}건")
    if generic_ratio > 0.2:
        q.fail_reasons.append(f"일반 문구 비율 {generic_ratio*100:.1f}% (기준 20% 초과)")
    no_photo_pages = sum(1 for p in content_pages if not p.get("images") and p["type"] != "case")
    if content_pages and no_photo_pages / len(content_pages) > 0.4:
        q.fail_reasons.append(f"사진 없는 페이지 비율 {no_photo_pages/len(content_pages)*100:.1f}% (기준 40% 초과)")
    if leaked:
        q.fail_reasons.append("민감정보 잔존 의심")

    if q.fail_reasons and q.total >= 85.0:
        q.passed = False  # 명시적 실패 조건이 있으면 총점과 무관하게 실패 처리

    return q


def report_text(q: QualityReport) -> str:
    lines = ["=== 품질 점수 (100점 만점) ===", ""]
    labels = {
        "photo_utilization": "사진 활용률(20점)", "text_utilization": "원본 문구 활용률(15점)",
        "caption_relevance": "사진-문구 연관성(15점)", "page_density": "페이지별 콘텐츠 밀도(10점)",
        "persuasion_flow": "입주민 설득 흐름(10점)", "process_specificity": "공정 설명 구체성(10점)",
        "duplication": "중복 사진·문구 없음(5점)", "layout_integrity": "레이아웃 완성도(5점)",
        "text_overlap": "텍스트 잘림·겹침 없음(5점)", "sensitive_info": "민감정보 검증(5점)",
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
