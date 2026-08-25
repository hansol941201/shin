#!/usr/bin/env python3
"""
영상에 쓰이는 견적 문서 이미지에서 개인/식별 정보를 모자이크 처리한다.

_src_private/ (원본, 저장소에 커밋하지 않음) -> images/ (모자이크본, 영상 소스)

모자이크는 해당 영역을 블록 단위로 다운샘플 -> 업샘플 하는 방식이라
원래 픽셀 정보가 실제로 파괴되며(복원 불가), 그 위에 약한 블러와
가장자리 페더링만 얹어 문서에 자연스럽게 녹아들게 한다.
영역의 크기·위치·주변 배치는 그대로 두어 문서의 구도는 유지된다.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, "_src_private")
OUT_DIR = os.path.join(HERE, "images")

# (x0, y0, x1, y1, 블록크기, 설명)  좌표는 원본 2000x1413 기준
REGIONS = {
    "02_안내사항.png": [
        ( 445, 329,  714, 385, 20, "견적일자(날짜)"),
        ( 448, 380,  876, 436, 20, "발주처(고객사명)"),
        (1208, 281, 1500, 345, 20, "업체 상호"),
        (1498, 260, 1652, 408, 24, "법인 인감"),
        (1738, 294, 1884, 342, 16, "업체 로고 워드마크"),
        (1338, 386, 1702, 434, 20, "주소"),
        (1338, 434, 1872, 478, 20, "전화번호/팩스번호"),
        ( 876, 555, 1100, 604, 18, "동·호수(세대 정보)"),
    ],
    "07_물량산출내역서.png": [
        ( 236, 176,  624, 238, 20, "현장명(아파트명)"),
    ],
    # 03_원가계산서 / 04_집계표 / 06_산출내역서 에는 이름·연락처·주소·
    # 날짜·계정 정보가 없어 가릴 영역이 없다(공종/자재/금액만 기재).
    "03_원가계산서.png": [],
    "04_집계표.png": [],
    "06_산출내역서.png": [],
}


def mosaic_region(img, box, block):
    """box 영역을 block 픽셀 단위 모자이크로 덮어쓴다(가장자리는 페더링)."""
    x0, y0, x1, y1 = box
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(img.width, x1), min(img.height, y1)
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return

    patch = img.crop((x0, y0, x1, y1))
    small = patch.resize((max(1, w // block), max(1, h // block)), Image.BOX)
    mosaic = small.resize((w, h), Image.NEAREST)
    # 블록 경계를 약간 풀어 인쇄물 위에 자연스럽게 얹힌 느낌을 준다
    mosaic = mosaic.filter(ImageFilter.GaussianBlur(block / 3.2))

    feather = max(2, block // 4)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (feather, feather, w - feather - 1, h - feather - 1),
        radius=feather * 2, fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(feather * 0.9))

    patch.paste(mosaic, (0, 0), mask)
    img.paste(patch, (x0, y0))


def main():
    if not os.path.isdir(SRC_DIR):
        sys.exit("원본 이미지 폴더가 없습니다: %s" % SRC_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    for name, regions in REGIONS.items():
        src = os.path.join(SRC_DIR, name)
        if not os.path.exists(src):
            sys.exit("원본을 찾을 수 없습니다: %s" % src)
        img = Image.open(src).convert("RGB")
        for x0, y0, x1, y1, block, label in regions:
            mosaic_region(img, (x0, y0, x1, y1), block)
        img.save(os.path.join(OUT_DIR, name), optimize=True)
        print("%-28s 모자이크 %d곳%s" % (
            name, len(regions),
            "  (" + ", ".join(r[5] for r in regions) + ")" if regions else "",
        ))


if __name__ == "__main__":
    main()
