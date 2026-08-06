# -*- coding: utf-8 -*-
"""
입주민용 공종 설명자료 PPT 자동 제작 프로그램 - 파이프라인 오케스트레이터 + CLI.

사용법:
    python -m app.main --apt "행복아파트" --work 재도장 --output ./output file1.pptx file2.pptx [file3.pptx]
"""
import argparse
import datetime
import os
import subprocess
import sys
import tempfile
import traceback
from typing import Callable, List, Optional

from app.anonymizer.anonymizer import build_blacklist, evaluate_image
from app.content_selector import selector as cs
from app.image_classifier.classifier import classify_all, dedupe_images, detect_before_after_pairs
from app.image_extractor.extractor import extract_images
from app.ppt_generator.generator import generate_pptx
from app.ppt_parser.parser import make_workcopy, parse_presentation
from app.slide_planner.planner import build_content_plan, plan_slides
from app.validator.validator import validate_and_fix

STAGES = [
    "PPT 분석 중", "이미지 추출 중", "기존 정보 제거 중", "사진 분류 중",
    "슬라이드 구성 중", "PowerPoint 생성 중", "검수 중", "완료",
]


def _log(logs: List[str], msg: str):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    logs.append(f"[{ts}] {msg}")


def _report(cb: Optional[Callable[[str], None]], stage: str):
    if cb:
        cb(stage)


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


def run_pipeline(apartment_name: str, work_type: str, input_paths: List[str], output_dir: str,
                  progress_cb: Optional[Callable[[str], None]] = None) -> dict:
    logs: List[str] = []
    _log(logs, f"입력 검증 시작 - 아파트명='{apartment_name}', 공종='{work_type}', 파일수={len(input_paths)}")

    if not apartment_name or not apartment_name.strip():
        raise ValueError("새 아파트명을 입력해야 합니다.")
    if len(input_paths) < 2 or len(input_paths) > 3:
        raise ValueError("기존 PPT 파일은 2개 또는 3개를 입력해야 합니다.")
    for p in input_paths:
        if not os.path.exists(p):
            raise FileNotFoundError(f"파일을 찾을 수 없습니다: {p}")

    os.makedirs(output_dir, exist_ok=True)
    temp_root = tempfile.mkdtemp(prefix="resident_ppt_")
    _log(logs, f"임시 작업 폴더 생성: {temp_root}")

    # 1. PPT 분석
    _report(progress_cb, STAGES[0])
    all_slides, all_texts, source_files = [], [], []
    prs_objects = []
    for i, path in enumerate(input_paths):
        label = f"입력파일{i+1}"
        source_files.append(label)
        work_copy = make_workcopy(path, temp_root)
        slides, texts, prs = parse_presentation(work_copy, label)
        all_slides.extend(slides)
        all_texts.extend(texts)
        prs_objects.append((label, prs))
        _log(logs, f"{label}({os.path.basename(path)}) 분석 완료 - 슬라이드 {len(slides)}개, 텍스트 {len(texts)}건")

    # 2. 이미지 추출
    _report(progress_cb, STAGES[1])
    all_images = []
    for label, prs in prs_objects:
        slides_for_file = [s for s in all_slides if s.source_file == label]
        imgs = extract_images(prs, label, slides_for_file, temp_root, run_ocr=True)
        all_images.extend(imgs)
        _log(logs, f"{label} 이미지 추출 완료 - {len(imgs)}장")

    # 3. 기존 정보 제거 (블랙리스트 구성 + 배제 판정)
    _report(progress_cb, STAGES[2])
    blacklist = build_blacklist(all_texts, all_images, apartment_name)
    _log(logs, f"블랙리스트 구성 완료 - 아파트명후보 {len(blacklist.apt_names)}, "
               f"회사명후보 {len(blacklist.companies)}, 전화 {len(blacklist.phones)}, "
               f"이메일 {len(blacklist.emails)}, URL {len(blacklist.urls)}")
    for img in all_images:
        evaluate_image(img, blacklist)
    banned_count = sum(1 for i in all_images if i.banned)
    _log(logs, f"회사/현장 식별 정보 포함 추정 이미지 {banned_count}장 배제")

    # 4. 사진 분류 + 중복 제거 + 전후 관계 탐지
    _report(progress_cb, STAGES[3])
    classify_all(all_images)
    dedupe_images(all_images)
    dup_count = sum(1 for i in all_images if i.is_duplicate_of)
    _log(logs, f"이미지 분류 완료, 중복 이미지 {dup_count}장 제외")
    detect_before_after_pairs(all_images, all_slides)

    images_by_id = {i.id: i for i in all_images}

    # 5. 슬라이드 구성 (콘텐츠 선별 + 플랜)
    _report(progress_cb, STAGES[4])
    cover_id = cs.select_cover_image(all_images)
    defect_ids = cs.select_defect_images(all_images)
    method_ids = cs.select_method_overview_images(all_images)
    feature_ids = cs.select_feature_images(all_images)
    effect_ids = cs.select_effect_images(all_images)
    process_steps = cs.build_process_steps(all_images, all_texts, source_files)
    ba_pairs = cs.build_before_after_cases(all_images)

    warnings = []
    if not ba_pairs:
        warnings.append("전·후 관계가 명확한 사진 쌍을 찾지 못해 유사 시공 사례 페이지가 생략되었습니다.")
    if not process_steps:
        warnings.append("공법 순서를 확인할 수 있는 자료가 부족하여 시공 순서 페이지가 생략되었습니다.")
    needs_confirm = [s.name for s in process_steps if s.needs_user_confirmation]
    if needs_confirm:
        warnings.append(f"입력 자료 간 공정 순서 표기가 달라 사용자 확인이 필요한 단계: {', '.join(needs_confirm)}")

    for w in warnings:
        _log(logs, f"[경고] {w}")

    content_plan = build_content_plan(
        apartment_name, work_type, cover_id, defect_ids, method_ids, feature_ids,
        process_steps, ba_pairs, effect_ids, warnings,
    )
    slide_plan = plan_slides(content_plan)
    _log(logs, f"슬라이드 구성 완료 - 총 {len(slide_plan)}페이지 계획")

    # 6. PPTX 생성
    _report(progress_cb, STAGES[5])
    safe_name = "".join(c for c in apartment_name if c not in '\\/:*?"<>|').strip() or "새아파트"
    out_pptx = os.path.join(output_dir, f"{safe_name}_{work_type}_입주민설명자료.pptx")
    generate_pptx(slide_plan, images_by_id, out_pptx)
    _log(logs, f"PowerPoint 파일 생성 완료: {out_pptx}")

    # 7. 검수
    _report(progress_cb, STAGES[6])
    report = validate_and_fix(out_pptx, blacklist, apartment_name)
    _log(logs, "자동 검수 완료")

    report_path = os.path.join(output_dir, f"{safe_name}_검수결과.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report.as_text())

    # PDF / 미리보기 생성 (LibreOffice가 없는 환경에서는 건너뜀)
    pdf_path = convert_to_pdf(out_pptx, output_dir)
    if pdf_path:
        wanted_pdf = os.path.join(output_dir, f"{safe_name}_{work_type}_입주민설명자료.pdf")
        if pdf_path != wanted_pdf:
            os.replace(pdf_path, wanted_pdf)
            pdf_path = wanted_pdf
        _log(logs, f"PDF 미리보기 생성 완료: {pdf_path}")
        preview_png = os.path.join(output_dir, f"{safe_name}_미리보기.png")
        if build_preview_image(pdf_path, preview_png):
            _log(logs, f"슬라이드 미리보기 이미지 생성 완료: {preview_png}")
        else:
            preview_png = None
            _log(logs, "미리보기 이미지 생성 실패(건너뜀)")
    else:
        preview_png = None
        _log(logs, "LibreOffice를 찾을 수 없어 PDF/미리보기 생성을 건너뛰었습니다.")

    log_path = os.path.join(output_dir, f"{safe_name}_처리로그.txt")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(logs))

    _report(progress_cb, STAGES[7])

    return {
        "pptx": out_pptx,
        "pdf": pdf_path,
        "preview_png": preview_png,
        "log": log_path,
        "validation_report": report_path,
        "warnings": warnings,
        "validation": report,
        "temp_dir": temp_root,
    }


def main():
    parser = argparse.ArgumentParser(description="입주민 설명자료 자동 제작")
    parser.add_argument("files", nargs="+", help="기존 PPT 파일 2~3개")
    parser.add_argument("--apt", required=True, help="새 아파트명")
    parser.add_argument("--work", default="재도장", choices=["재도장", "방수", "보수·보강", "아스콘", "기타"])
    parser.add_argument("--output", default="./output", help="결과물 저장 폴더")
    args = parser.parse_args()

    def cb(stage):
        print(f"  >> {stage}")

    try:
        result = run_pipeline(args.apt, args.work, args.files, args.output, progress_cb=cb)
    except Exception as e:
        print(f"[오류] {e}")
        traceback.print_exc()
        sys.exit(1)

    print("\n=== 완료 ===")
    for k in ("pptx", "pdf", "preview_png", "log", "validation_report"):
        print(f"{k}: {result.get(k)}")
    if result["warnings"]:
        print("\n[확인 필요]")
        for w in result["warnings"]:
            print(f" - {w}")


if __name__ == "__main__":
    main()
