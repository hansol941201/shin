# -*- coding: utf-8 -*-
"""
기존 아파트 정보 / 회사 정보 / 개인정보를 탐지하고 결과물에서 제거하기 위한 모듈.
- 텍스트 런과 이미지 OCR 결과를 모두 스캔하여 금지 문자열 블랙리스트를 구성한다.
- 자동 판별이 확실하지 않은 요소는 사용하지 않는 것을 기본 원칙으로 한다(보수적 처리).
"""
import re
from dataclasses import dataclass, field
from typing import List, Set

from app.utils.config import (
    RE_PHONE, RE_EMAIL, RE_URL, RE_BIZNO, RE_QR_HINT, RE_ADDRESS_HINT,
    RE_APT_NAME_HINT, RE_COMPANY_HINT, RE_PERSON_TITLE, RE_CAR_PLATE,
)
from app.utils.models import TextRun, ImageAsset


@dataclass
class Blacklist:
    apt_names: Set[str] = field(default_factory=set)
    companies: Set[str] = field(default_factory=set)
    addresses: Set[str] = field(default_factory=set)
    phones: Set[str] = field(default_factory=set)
    emails: Set[str] = field(default_factory=set)
    urls: Set[str] = field(default_factory=set)
    biznos: Set[str] = field(default_factory=set)
    persons: Set[str] = field(default_factory=set)

    def all_strings(self) -> List[str]:
        out = []
        for s in (self.apt_names, self.companies, self.addresses, self.phones,
                   self.emails, self.urls, self.biznos, self.persons):
            out.extend(s)
        # 긴 문자열부터 치환해야 부분 중복 치환 오류가 없다
        return sorted(set(out), key=len, reverse=True)


def _scan_text_for_entities(text: str, bl: Blacklist):
    for m in RE_APT_NAME_HINT.finditer(text):
        bl.apt_names.add(m.group(0))
    for m in RE_COMPANY_HINT.finditer(text):
        bl.companies.add(m.group(0))
    for m in RE_ADDRESS_HINT.finditer(text):
        bl.addresses.add(m.group(0))
    for m in RE_PHONE.finditer(text):
        bl.phones.add(m.group(0))
    for m in RE_EMAIL.finditer(text):
        bl.emails.add(m.group(0))
    for m in RE_URL.finditer(text):
        bl.urls.add(m.group(0))
    for m in RE_BIZNO.finditer(text):
        bl.biznos.add(m.group(0))
    for m in RE_PERSON_TITLE.finditer(text):
        bl.persons.add(m.group(0))


def build_blacklist(text_runs: List[TextRun], image_assets: List[ImageAsset],
                     new_apartment_name: str) -> Blacklist:
    """모든 텍스트 런 + 이미지 OCR 결과를 스캔하여 금지 문자열 목록을 만든다.
    새 아파트명과 100% 동일한 문자열은 블랙리스트에서 제외한다(혼동 방지).
    """
    bl = Blacklist()
    for run in text_runs:
        _scan_text_for_entities(run.text, bl)
    for img in image_assets:
        if img.ocr_text:
            _scan_text_for_entities(img.ocr_text, bl)

    if new_apartment_name:
        bl.apt_names.discard(new_apartment_name)
        bl.apt_names = {a for a in bl.apt_names if new_apartment_name not in a}

    return bl


def text_contains_banned(text: str, bl: Blacklist) -> bool:
    if not text:
        return False
    if RE_QR_HINT.search(text):
        return True
    if RE_CAR_PLATE.search(text):
        return True
    for s in bl.all_strings():
        if s and s in text:
            return True
    return False


def clean_text(text: str, bl: Blacklist) -> str:
    """텍스트에서 금지 문자열만 제거한다(허용 범위 내 재사용을 위한 최소 마스킹)."""
    if not text:
        return text
    cleaned = text
    for s in bl.all_strings():
        if s:
            cleaned = cleaned.replace(s, "")
    cleaned = RE_QR_HINT.sub("", cleaned)
    cleaned = RE_CAR_PLATE.sub("", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def evaluate_image(img: ImageAsset, bl: Blacklist) -> None:
    """이미지가 회사/현장 식별 정보를 포함하는지 평가하여 banned 플래그를 채운다.
    자동 판별이 애매하면 보수적으로 배제(banned=True) 처리한다.
    """
    reasons = []

    name_low = (img.shape_name or "").lower()
    if any(k in name_low for k in ("logo", "ci_", "brand", "로고")):
        reasons.append("도형 이름에 로고 표시")

    if img.ocr_text:
        if text_contains_banned(img.ocr_text, bl):
            reasons.append("이미지 내 텍스트(OCR)에서 금지 정보 감지")
        if RE_QR_HINT.search(img.ocr_text):
            reasons.append("QR코드로 추정되는 텍스트 감지")

    # 극단적인 종횡비(가로/세로 5배 이상)는 현수막/배너/로고일 가능성이 높음 -> 배제
    if img.width and img.height:
        ratio = max(img.width, img.height) / max(1, min(img.width, img.height))
        if ratio >= 5:
            reasons.append("배너/현수막으로 추정되는 극단적 종횡비")

    # 매우 작은 이미지는 아이콘/로고일 가능성이 높음
    if img.width < 120 or img.height < 120:
        reasons.append("아이콘/로고로 추정되는 저해상도 소형 이미지")

    if reasons:
        img.banned = True
        img.banned_reasons = reasons
