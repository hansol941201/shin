# -*- coding: utf-8 -*-
"""PPT 내부에 포함된 모든 이미지를 추출하고 기본 메타데이터(해상도, 해시, OCR)를 계산한다."""
import os
import uuid
from typing import List

from PIL import Image, ImageOps
import imagehash

try:
    import pytesseract
    _OCR_AVAILABLE = True
except Exception:
    _OCR_AVAILABLE = False

from app.utils.models import ImageAsset, SlideRecord

PICTURE_SHAPE_TYPE = 13  # MSO_SHAPE_TYPE.PICTURE


def _iter_shapes(shapes):
    for shape in shapes:
        yield shape
        if shape.shape_type == 6:  # GROUP
            try:
                yield from _iter_shapes(shape.shapes)
            except Exception:
                pass


def _preprocess_for_ocr(pil_img: Image.Image) -> Image.Image:
    """OCR 인식률 향상을 위한 전처리: 흑백 변환 + 확대 + 대비 보정.
    사진 안에 작게 삽입된 아파트명/현수막 문구까지 최대한 탐지하기 위함이다.
    """
    im = pil_img.convert("L")
    if max(im.size) < 2000:
        im = im.resize((im.width * 2, im.height * 2))
    return ImageOps.autocontrast(im)


def _ocr_text(pil_img: Image.Image) -> str:
    if not _OCR_AVAILABLE:
        return ""
    texts = []
    try:
        try:
            texts.append(pytesseract.image_to_string(pil_img, lang="kor+eng"))
        except Exception:
            texts.append(pytesseract.image_to_string(pil_img))
        pre = _preprocess_for_ocr(pil_img)
        try:
            texts.append(pytesseract.image_to_string(pre, lang="kor+eng"))
        except Exception:
            texts.append(pytesseract.image_to_string(pre))
    except Exception:
        pass
    return "\n".join(t.strip() for t in texts if t and t.strip())


def extract_images(prs, source_label: str, slide_records: List[SlideRecord],
                    temp_dir: str, run_ocr: bool = True) -> List[ImageAsset]:
    """python-pptx Presentation 객체에서 모든 사진을 추출한다."""
    img_dir = os.path.join(temp_dir, "images")
    os.makedirs(img_dir, exist_ok=True)

    assets: List[ImageAsset] = []
    slide_text_by_idx = {s.index: s.all_text for s in slide_records}
    slide_title_by_idx = {s.index: s.title_text for s in slide_records}

    for idx, slide in enumerate(prs.slides):
        nearby = (slide_title_by_idx.get(idx, "") + "\n" + slide_text_by_idx.get(idx, "")).strip()
        for shape in _iter_shapes(slide.shapes):
            if shape.shape_type != PICTURE_SHAPE_TYPE:
                continue
            try:
                image = shape.image
                blob = image.blob
                ext = image.ext or "png"
            except Exception:
                continue

            asset_id = uuid.uuid4().hex[:12]
            out_path = os.path.join(img_dir, f"{asset_id}.{ext}")
            try:
                with open(out_path, "wb") as f:
                    f.write(blob)
                pil_img = Image.open(out_path)
                pil_img.load()
                w, h = pil_img.size
            except Exception:
                continue

            # 너무 작은 이미지(아이콘/장식)는 스킵 대상으로만 표시(카테고리 단계에서 필터)
            phash = None
            try:
                phash = str(imagehash.phash(pil_img.convert("RGB")))
            except Exception:
                pass

            ocr_text = ""
            if run_ocr and min(w, h) >= 60:
                try:
                    ocr_text = _ocr_text(pil_img.convert("RGB"))
                except Exception:
                    ocr_text = ""

            alt_text = getattr(shape, "name", "") or ""
            try:
                # alt text(설명) 추출 시도 (python-pptx는 공식 API가 없어 XML 직접 접근)
                descr = shape._element.nvSpPr if hasattr(shape._element, "nvSpPr") else None
            except Exception:
                pass

            try:
                left, top = int(shape.left or 0), int(shape.top or 0)
            except Exception:
                left, top = 0, 0

            assets.append(ImageAsset(
                id=asset_id,
                source_file=source_label,
                slide_index=idx,
                shape_name=alt_text,
                path=out_path,
                width=w,
                height=h,
                phash=phash,
                ocr_text=ocr_text,
                nearby_text=nearby,
                left=left,
                top=top,
            ))

    return assets
