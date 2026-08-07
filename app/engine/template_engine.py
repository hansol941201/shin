# -*- coding: utf-8 -*-
"""
Template Engine: 카테고리(표지/현장사진/공사필요성/주요하자/보수방법/공법특징/
사용자재/시공순서/전후사례/기대효과/마무리)별로 templates/ 폴더 아래에 있는
실제 PowerPoint(.pptx) 템플릿 파일을 찾아서 고른다.

새 공종/새 디자인이 필요하면 templates/<카테고리>/ 폴더에 .pptx 파일만
추가하면 자동으로 후보에 포함된다(코드 수정 불필요) - 확장 가능한 구조.
"""
import os
import sys
from typing import List, Optional


def _resolve_templates_root() -> str:
    """개발 환경(소스에서 실행)과 PyInstaller EXE(빌드 후 배포) 양쪽에서 모두
    templates/ 폴더를 찾는다. PyInstaller로 빌드되면 이 파일의 실제 경로가
    임시 추출 폴더(sys._MEIPASS) 아래로 바뀌므로, __file__ 기준 상대 경로만
    쓰면 EXE에서 템플릿을 찾지 못한다(그러면 조용히 generator2 폴백만 계속
    쓰게 되어버림 - 반드시 먼저 프로즌 여부를 확인한다)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, "templates")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "templates")


TEMPLATES_ROOT = _resolve_templates_root()

# Story Engine의 페이지 종류(semantic 카테고리) -> 템플릿 폴더 이름
CATEGORY_FOLDERS = {
    "cover": "cover",
    "site_photos": "site_photo",
    "reason": "need",
    "defect": "defect",
    "method_reason": "repair",
    "features": "feature",
    "material": "material",
    "process": "process",
    "case": "before_after",
    "effects": "effect",
    "closing": "closing",
}


def list_templates(category: str) -> List[str]:
    """카테고리 폴더 안의 .pptx 템플릿 파일 목록(정렬됨)을 반환한다."""
    folder_name = CATEGORY_FOLDERS.get(category, category)
    folder = os.path.join(TEMPLATES_ROOT, folder_name)
    if not os.path.isdir(folder):
        return []
    return sorted(
        os.path.join(folder, f) for f in os.listdir(folder)
        if f.lower().endswith(".pptx") and not f.startswith("~$")
    )


def has_templates(category: str) -> bool:
    return len(list_templates(category)) > 0


def pick_template(category: str, prev_path: Optional[str] = None) -> Optional[str]:
    """해당 카테고리의 템플릿 중 하나를 고른다. 직전에 쓴 템플릿과 같은 폴더에
    변형이 여러 개 있으면 다른 파일을 우선 선택해 같은 템플릿이 연속으로
    반복되지 않게 한다."""
    candidates = list_templates(category)
    if not candidates:
        return None
    if prev_path and prev_path in candidates and len(candidates) > 1:
        others = [c for c in candidates if c != prev_path]
        return others[0]
    return candidates[0]
