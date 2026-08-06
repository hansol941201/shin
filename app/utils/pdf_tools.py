# -*- coding: utf-8 -*-
"""LibreOffice 기반 PDF 변환 및 PyMuPDF 기반 미리보기 이미지 생성 유틸."""
import os
import subprocess
from typing import Optional


def convert_to_pdf(pptx_path: str, out_dir: str) -> Optional[str]:
    try:
        subprocess.run(
            ["soffice", "--headless", "--norestore", "--convert-to", "pdf", "--outdir", out_dir, pptx_path],
            check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        pdf_path = os.path.join(out_dir, os.path.splitext(os.path.basename(pptx_path))[0] + ".pdf")
        return pdf_path if os.path.exists(pdf_path) else None
    except Exception:
        return None


def build_preview_image(pdf_path: str, out_png: str, cols: int = 3) -> Optional[str]:
    try:
        import fitz  # PyMuPDF
        from PIL import Image

        doc = fitz.open(pdf_path)
        thumbs = []
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(0.6, 0.6))
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            thumbs.append(img)
        if not thumbs:
            return None
        rows = (len(thumbs) + cols - 1) // cols
        tw, th = thumbs[0].size
        pad = 10
        grid = Image.new("RGB", (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad), "white")
        for i, im in enumerate(thumbs):
            r, c = divmod(i, cols)
            x = pad + c * (tw + pad)
            y = pad + r * (th + pad)
            grid.paste(im, (x, y))
        grid.save(out_png)
        return out_png
    except Exception:
        return None
