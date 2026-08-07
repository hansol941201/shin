# -*- coding: utf-8 -*-
"""
사용자가 현장등록 단계에서 이미 아파트명/공종을 입력해 알고 있으므로, 이 모듈은
별도의 AI 현장진단이나 공법 판단을 하지 않는다. 사용자가 추가한 "현재 이 아파트"의
현장사진을 그대로 결과 PPT 앞부분에 보기 좋게 배치하는 것이 유일한 목적이다.

절대 하지 않는 것:
- 사진을 분석해 균열/박리/누수/보수 필요 등 기술적 상태를 판단하거나 새로 문구를 생성하는 것
- 분류(classify_all)/OCR/익명화/중복 판정 등 기존 PPT 추출 이미지용 파이프라인에 태우는 것
  (이 사진은 "다른 아파트의 기존 사례"가 아니라 "지금 이 아파트"의 사진이므로 별도 취급)
- "유사 시공사례"(before/after) 등 기존 PPT 사진과 섞어서 재사용하는 것
"""
import os
import shutil
import uuid
from typing import List

from PIL import Image

from app.utils.models import ImageAsset

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
# 최대 3페이지까지만 생성한다는 원칙에 맞춰, 지나치게 많은 현장사진이 선택돼도
# 상한을 둔다(그 이상은 지면 제한으로 생략하고 로그에 남긴다).
MAX_SITE_PHOTOS = 12


def validate_site_photo_paths(paths: List[str]) -> None:
    """지원 확장자·존재 여부만 확인한다(이미지 내용 분석/진단은 하지 않음)."""
    errors = []
    for p in paths:
        if not os.path.exists(p) or not os.path.isfile(p):
            errors.append(f"현장사진을 찾을 수 없습니다: {p}")
            continue
        ext = os.path.splitext(p)[1].lower()
        if ext not in SUPPORTED_EXTS:
            errors.append(f"지원하지 않는 현장사진 형식입니다({ext}): {os.path.basename(p)}")
            continue
        if os.path.getsize(p) == 0:
            errors.append(f"현장사진 파일이 비어 있습니다: {os.path.basename(p)}")
    if errors:
        raise ValueError("\n".join(errors))


def load_site_photos(paths: List[str], work_dir: str, logs: List[str] = None) -> List[ImageAsset]:
    """현장사진을 작업 폴더로 복사하고 최소한의 메타데이터(가로/세로 크기)만 읽는다.
    분류/OCR/익명화/중복사진 판단을 하지 않는다 - 사용자가 이미 아파트명/공종을 알고
    직접 고른 "이 아파트의" 사진이므로 그대로 보여주기만 하면 된다."""
    os.makedirs(work_dir, exist_ok=True)
    use_paths = paths[:MAX_SITE_PHOTOS]
    if logs is not None and len(paths) > MAX_SITE_PHOTOS:
        logs.append(f"[현장사진] 선택 {len(paths)}장 중 상한({MAX_SITE_PHOTOS}장)을 초과한 "
                     f"{len(paths) - MAX_SITE_PHOTOS}장은 지면 제한으로 생략됩니다.")
    out = []
    for idx, src in enumerate(use_paths):
        ext = os.path.splitext(src)[1].lower()
        dst = os.path.join(work_dir, f"site_{uuid.uuid4().hex[:8]}{ext}")
        shutil.copy2(src, dst)
        try:
            with Image.open(dst) as im:
                w, h = im.size
        except Exception:
            w, h = 1600, 1200
        out.append(ImageAsset(
            id=f"site_{idx}_{uuid.uuid4().hex[:6]}",
            source_file="현장사진", slide_index=idx, shape_name=f"site_photo_{idx+1}",
            path=dst, width=w, height=h, category="현장사진",
            source_type="current_site",
        ))
    if logs is not None:
        logs.append(f"[현장사진] source_type=current_site 로 {len(out)}장 등록 완료 "
                     f"(기존 PPT 추출 사진과 별도 관리, 분류/진단 없음)")
    return out
