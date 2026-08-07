# -*- coding: utf-8 -*-
"""
design_rules.json 로더. "템플릿 파일은 그대로 두고 규칙 값만 바꿔도 전체 결과물
품질이 조정되도록" 만드는 것이 목적이므로, story.py(페이지 구성)와
quality.py(품질 평가/하드 FAIL 판정)가 도형/색상 같은 디자인 자체가 아니라
"페이지당 문구/사진 개수 상한, 페이지 수 범위, 레이아웃 반복 금지" 같은
구조적 규칙만 이 파일에서 읽어 쓴다.
"""
import json
import os
from typing import Any, Dict

_RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "design_rules.json")

_DEFAULTS: Dict[str, Any] = {
    "page_count": {"min_total_pages": 8, "recommended_max_pages": 12, "max_total_pages": 14},
    "content_per_page": {"max_bullets_per_page": 5, "max_photos_per_page": 5, "max_process_pages": 2},
    "photo_text_balance": {"photo_area_pct_min": 65, "photo_area_pct_max": 75},
    "layout_rules": {
        "no_consecutive_same_layout": True, "no_duplicate_photo_in_deck": True,
        "no_text_overflow": True, "no_photo_distortion": True,
        "shrink_font_to_fit_forbidden": True, "min_margin_mm": 10,
    },
    "reconstruction_rules": {
        "auto_reconstruct_if_text_exceeds_photo_capacity": True, "trim_text_before_shrinking_font": True,
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_design_rules() -> Dict[str, Any]:
    """파일이 없거나 손상되어도 프로그램이 멈추지 않도록, 실패 시 내장 기본값을 쓴다."""
    try:
        with open(_RULES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return _deep_merge(_DEFAULTS, {k: v for k, v in data.items() if not k.startswith("_")})
    except Exception:
        return dict(_DEFAULTS)


DESIGN_RULES = load_design_rules()


def rule(*path, default=None):
    """예: rule("content_per_page", "max_bullets_per_page")"""
    node = DESIGN_RULES
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return default
        node = node[key]
    return node
