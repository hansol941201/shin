# -*- coding: utf-8 -*-
"""
입력 PPT 2~3개의 모든 문구(제목/본문/표/도형 텍스트)를 용도별로 분석하여
"콘텐츠 라이브러리"를 구성한다. 결과물의 본문 문구는 이 라이브러리에서 뽑은
실제 원본 문구를 최대한 사용하고, 라이브러리가 비어 있는 항목에 한해서만
중립적인 기본 문구로 대체한다(이 경우 로그에 "기본 문구 사용"으로 명시한다).

허용: 문장을 짧게 정리, 중복 제거, 어투 통일, 개인정보/현장정보 마스킹
금지: 원본에 없는 성능/수치/보증/실적 등을 새로 생성하는 것
"""
import re
from dataclasses import dataclass, field
from typing import Dict, List

from app.anonymizer.anonymizer import Blacklist, clean_text, text_contains_banned
from app.utils.config import TEXT_PURPOSE_KEYWORDS
from app.utils.models import TextRun

MIN_USABLE_LEN = 6   # 너무 짧은 조각(예: "완료", "사진1")은 문장으로 쓰기 어려움
MAX_PHRASE_LEN = 90  # 슬라이드 본문에 넣기 적당한 최대 길이


@dataclass
class TextCandidate:
    source_file: str
    slide_index: int
    purpose: str
    original: str
    cleaned: str
    sensitive: bool
    usable: bool


def classify_text_purpose(text: str) -> str:
    low = text.replace(" ", "")
    best, best_score = "기타", 0
    for purpose, keywords in TEXT_PURPOSE_KEYWORDS.items():
        matched = [kw for kw in keywords if kw.replace(" ", "") in low]
        score = sum(len(kw.replace(" ", "")) for kw in matched)
        if score > best_score:
            best, best_score = purpose, score
    return best


def _normalize(text: str) -> str:
    return re.sub(r"\s+", "", text).strip("·-• \t\n")


def build_text_candidates(text_runs: List[TextRun], blacklist: Blacklist) -> List[TextCandidate]:
    """모든 텍스트 런을 용도별로 분류하고, 민감정보를 제거한 재사용 가능 문구 후보를 만든다."""
    candidates: List[TextCandidate] = []
    for run in text_runs:
        for line in re.split(r"[\n]", run.text):
            line = line.strip(" \t·-•")
            if not line:
                continue
            sensitive = text_contains_banned(line, blacklist)
            cleaned = clean_text(line, blacklist)
            purpose = classify_text_purpose(line)
            usable = (
                len(cleaned) >= MIN_USABLE_LEN
                and not sensitive_leftover(cleaned)
            )
            candidates.append(TextCandidate(
                source_file=run.source_file,
                slide_index=run.slide_index,
                purpose=purpose,
                original=line,
                cleaned=cleaned[:MAX_PHRASE_LEN],
                sensitive=sensitive,
                usable=usable,
            ))
    return candidates


def sensitive_leftover(cleaned_text: str) -> bool:
    """마스킹 후에도 의미가 깨졌거나(빈 문자열 다수) 남은 파편이 의미없는 경우 판별."""
    stripped = cleaned_text.strip()
    return len(stripped) < 2


def build_content_library(candidates: List[TextCandidate], max_per_purpose: int = 8) -> Dict[str, List[str]]:
    """용도별로 중복을 제거한 실제 원본 문구 라이브러리를 만든다."""
    library: Dict[str, List[str]] = {}
    seen: Dict[str, set] = {}
    for c in candidates:
        if not c.usable or c.purpose == "기타":
            continue
        key = _normalize(c.cleaned)
        seen.setdefault(c.purpose, set())
        if key in seen[c.purpose]:
            continue
        seen[c.purpose].add(key)
        library.setdefault(c.purpose, [])
        if len(library[c.purpose]) < max_per_purpose:
            library[c.purpose].append(c.cleaned)
    return library


def pick_phrases(library: Dict[str, List[str]], purpose: str, n: int = 1) -> List[str]:
    return list(library.get(purpose, []))[:n]


CAPTION_LEN_LIMIT = 26

CATEGORY_PURPOSE_HINTS = {
    "외벽_하자_균열": ["하자_현상", "하자_원인"],
    "외벽_하자_박리": ["하자_현상", "하자_원인"],
    "외벽_하자_오염": ["하자_현상", "하자_원인"],
    "외벽_하자_곰팡이": ["하자_현상", "하자_원인"],
    "외벽_하자_변색": ["하자_현상", "하자_원인"],
    "세척_작업": ["공법_설명", "시공_순서"],
    "균열_보수": ["공법_설명", "시공_순서"],
    "퍼티_작업": ["공법_설명", "시공_순서"],
    "하도": ["공법_설명", "시공_순서"],
    "중도": ["공법_설명", "시공_순서"],
    "상도": ["공법_설명", "시공_순서"],
    "도장_작업": ["공법_특징", "공법_설명"],
    "안전_작업": ["공법_설명", "주의사항"],
    "자재": ["자재_설명"],
    "시공_후": ["시공_후_효과", "기대_효과"],
}


def attach_real_captions(images: List, candidates: List[TextCandidate]) -> None:
    """같은 슬라이드에서 함께 쓰인 실제 문구를 찾아 사진의 짧은 캡션으로 연결한다.
    사진과 무관한 일반 문구를 임의로 붙이지 않도록, 반드시 같은 슬라이드(source_file+slide_index)
    안의 문구만 후보로 삼는다.
    """
    by_slide: Dict[tuple, List[TextCandidate]] = {}
    for c in candidates:
        if not c.usable:
            continue
        by_slide.setdefault((c.source_file, c.slide_index), []).append(c)

    for img in images:
        slide_candidates = by_slide.get((img.source_file, img.slide_index))
        if not slide_candidates:
            continue
        preferred_purposes = CATEGORY_PURPOSE_HINTS.get(img.category, [])
        pool = [c for c in slide_candidates if c.purpose in preferred_purposes and len(c.cleaned) <= 40]
        if not pool:
            pool = [c for c in slide_candidates if len(c.cleaned) <= 40]
        if pool:
            best = min(pool, key=lambda c: len(c.cleaned))
            img.real_caption = best.cleaned[:CAPTION_LEN_LIMIT]


def merge_two_phrases(a: str, b: str) -> str:
    """서로 다른 PPT의 상호보완적 문구를 하나의 문장으로 결합(원문 표현은 유지)."""
    a, b = a.strip(), b.strip()
    if not a:
        return b
    if not b or b in a:
        return a
    if a in b:
        return b
    joiner = " " if a.endswith((".", "다", "함", "니다")) else "하며 "
    return f"{a}{joiner}{b}"
