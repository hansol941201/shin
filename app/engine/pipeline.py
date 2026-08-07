# -*- coding: utf-8 -*-
"""
v2 콘텐츠 중심 파이프라인 오케스트레이터.
고정 템플릿에 내용을 끼워 맞추는 대신, 원본 사진/문구의 실제 분량과 맥락에 따라
페이지 구조를 스스로 결정하고, 품질 점수가 기준(85점) 미만이면 조건을 실제로 바꿔
재구성한다(단순 재실행이 아님).
"""
import datetime
import json
import os
from typing import Callable, List, Optional

from app.anonymizer.anonymizer import build_blacklist, evaluate_image
from app.content_selector import selector as cs
from app.content_selector.text_analyzer import (
    attach_real_captions, build_content_library, build_text_candidates,
)
from app.engine import inventory as inv
from app.engine import quality as qmod
from app.engine import render_check as rc
from app.engine.generator2 import generate_pptx_v2
from app.engine.grading import grade_all
from app.engine.grouping import build_groups, family_of, groups_to_json
from app.engine.story import build_pages
from app.image_classifier.classifier import classify_all, dedupe_images, detect_before_after_pairs
from app.image_extractor.extractor import extract_images
from app.ppt_parser.parser import make_workcopy, parse_presentation
from app.utils import debug_dump as dd
from app.utils.input_validation import inspect_file, resolve_input_file, validate_input_paths
from app.utils.paths import make_session_temp_dir
from app.utils.pdf_tools import convert_to_pdf
from app.validator.validator import validate_and_fix

PIPELINE_NAME = "run_pipeline_v2"

STAGES_V2 = [
    "PPT 분석 중", "이미지 추출 중", "문구 분석 중", "기존 정보 제거 중",
    "사진 분류 중", "사진·문구 관계 분석 중", "스토리 구성 중",
    "PowerPoint 생성 중", "검수 중", "품질 평가 중", "시각 검증 중", "완료",
]


def _log(logs: List[str], msg: str):
    logs.append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}")


def _report(cb, stage):
    if cb:
        cb(stage)


def _current_commit() -> str:
    from app.utils.version import get_build_commit
    return get_build_commit()


def _adjust_settings_for_retry(settings: dict, quality_report, content_library: dict,
                                 logs: List[str]) -> dict:
    """품질 실패 사유에 따라 실제로 조건을 바꾼다(단순 재실행 금지)."""
    new_settings = dict(settings)
    changed = []

    metrics = quality_report.metrics
    if metrics.get("photo_utilization", 1.0) < 0.75:
        # 갤러리 최소 배치 기준을 낮춰 낙오되는 A/B등급 사진을 추가로 흡수한다.
        new_settings["gallery_min_per"] = 1
        changed.append("사진 활용률 부족 -> 갤러리 페이지 최소 사진 기준 2장->1장으로 완화하여 "
                        "미사용 A/B등급 사진을 추가 배치")
    if metrics.get("text_utilization", 1.0) < 0.5:
        new_settings["min_text_bullets_for_text_page"] = 2
        changed.append("원본 문구 활용률 부족 -> 문구 전용 페이지 최소 기준 3개->2개로 완화하여 "
                        "더 많은 원본 문구를 본문에 반영")
    if metrics.get("page_density", 1.0) < 0.7 or any("빈약" in r for r in quality_report.fail_reasons):
        new_settings["max_images_per_page"] = 3
        new_settings["min_text_bullets_for_text_page"] = min(
            new_settings.get("min_text_bullets_for_text_page", 3), 2)
        changed.append("빈약한 페이지 다수 -> 페이지당 최대 사진 수를 줄이고(더 조밀하게 재배치) "
                        "1장짜리 사진 페이지도 문구 2개 이상이면 유지하도록 기준 통일")
    if any("반복" in r for r in quality_report.fail_reasons):
        changed.append("중복 사진 감지 -> 그룹 통합 로직은 이미 파일 간 동일 공정을 병합하므로 "
                        "다음 시도에서 동일 이미지 재사용 여부를 다시 점검")

    if not changed:
        # 실패 사유가 있는데 위 규칙에 해당하지 않으면 최소한 갤러리 기준이라도 완화한다.
        new_settings["gallery_min_per"] = 1
        changed.append("기타 사유 -> 갤러리 최소 배치 기준을 완화하여 재시도")

    for c in changed:
        _log(logs, f"  · 재구성 조정: {c}")
    return new_settings


def run_pipeline_v2(apartment_name: str, work_type: str, input_paths: List[str], output_dir: str,
                     progress_cb: Optional[Callable[[str], None]] = None,
                     extra_logs: Optional[List[str]] = None) -> dict:
    logs: List[str] = []
    if extra_logs:
        logs.extend(extra_logs)
    commit = _current_commit()
    _log(logs, f"[파이프라인] 사용 파이프라인: {PIPELINE_NAME}")
    _log(logs, f"[파이프라인] 최신 커밋 번호: {commit}")
    _log(logs, "[파이프라인] legacy 모듈(app.legacy.*, 고정 템플릿) 호출 여부: 없음")
    _log(logs, f"[v2 엔진] 입력 검증 - 아파트명='{apartment_name}', 공종='{work_type}', 파일수={len(input_paths)}")

    if not apartment_name or not apartment_name.strip():
        raise ValueError("새 아파트명을 입력해야 합니다.")
    if len(input_paths) < 2 or len(input_paths) > 3:
        raise ValueError("기존 PPT 파일은 2개 또는 3개를 입력해야 합니다.")

    # 파이프라인 시작 전에 각 입력 파일을 먼저 검사한다(존재/파일여부/크기/확장자).
    # 여기서 걸러지지 않으면 python-pptx가 나중에 알아보기 어려운 형태로 실패한다
    # (예: 구형 .ppt를 열려다 나는 "Package not found").
    validate_input_paths(input_paths)
    for p in input_paths:
        info = inspect_file(p)
        _log(logs, f"[집계] 입력 파일 확인 - {os.path.basename(p)}: "
                   f"확장자={info['ext']}, 크기={info['size_bytes']:,} bytes, 경로={info['path']}")

    os.makedirs(output_dir, exist_ok=True)
    # 시스템 전역 TEMP(사용자 PC 환경에 따라 예상 밖의 위치를 가리킬 수 있음, 예:
    # ESTsoft\CreatorTemp)에 의존하지 않고 프로그램 자체 temp/ 폴더를 사용한다.
    temp_root = make_session_temp_dir()
    _log(logs, f"[집계] 작업 임시 폴더(프로그램 자체 temp/): {temp_root}")
    safe_name = "".join(c for c in apartment_name if c not in '\\/:*?"<>|').strip() or "새아파트"

    # ---------- 1. PPT 분석 ----------
    _report(progress_cb, STAGES_V2[0])
    all_slides, all_texts, source_files, prs_objects = [], [], [], []
    for i, path in enumerate(input_paths):
        label = f"입력파일{i+1}"
        source_files.append(label)

        # 원본 절대경로는 절대 수정하지 않는다. 구형 .ppt는 여기서 .pptx로 변환을
        # 시도하고(LibreOffice 필요), 변환 결과물은 파이프라인 전용 임시 폴더에 둔다.
        resolved_path, converted = resolve_input_file(path, temp_root, logs=logs)

        try:
            work_copy = make_workcopy(resolved_path, temp_root)
            work_info = inspect_file(work_copy)
            _log(logs, f"[경로추적] {label} 작업 복사본 생성 -> {work_copy} "
                       f"(exists={work_info['exists']}, size={work_info['size_bytes']:,} bytes)")
            slides, texts, prs = parse_presentation(work_copy, label)
        except Exception as e:
            error_log_path = os.path.join(output_dir, f"{safe_name}_오류로그.txt")
            _log(logs, f"[오류] {label} PPT 열기 실패: {type(e).__name__}: {e}")
            try:
                with open(error_log_path, "w", encoding="utf-8") as f:
                    f.write("\n".join(logs))
            except Exception:
                pass
            raise ValueError(
                f"'{os.path.basename(path)}' 파일을 열 수 없습니다. PowerPoint(.pptx) 형식이 "
                f"맞는지, 파일이 손상되지 않았는지 확인 후 다시 시도해주세요.\n"
                f"  - 선택 원본 경로: {path}\n"
                f"  - 내부 작업 복사본 경로: {resolved_path}\n"
                f"  - 실패 단계: PPT 열기(Presentation)\n"
                f"  - 원본 오류: {type(e).__name__}: {e}\n"
                f"  - 처리 로그 파일: {error_log_path}"
            ) from e

        all_slides.extend(slides)
        all_texts.extend(texts)
        prs_objects.append((label, prs))
        _log(logs, f"[집계] {label}({os.path.basename(path)}) 슬라이드 수: {len(slides)}장, "
                   f"텍스트 조각: {len(texts)}건{' (.ppt -> .pptx 자동 변환됨)' if converted else ''}")

    # ---------- 2. 이미지 추출 ----------
    _report(progress_cb, STAGES_V2[1])
    all_images = []
    for label, prs in prs_objects:
        slides_for_file = [s for s in all_slides if s.source_file == label]
        imgs = extract_images(prs, label, slides_for_file, temp_root, run_ocr=True)
        all_images.extend(imgs)
        _log(logs, f"[집계] {label} 추출 사진 수: {len(imgs)}장")
    _log(logs, f"[집계] 전체 추출 사진 수: {len(all_images)}장")

    # ---------- 3. 문구 분석 ----------
    _report(progress_cb, STAGES_V2[2])
    blacklist = build_blacklist(all_texts, all_images, apartment_name)
    text_candidates = build_text_candidates(all_texts, blacklist)
    _log(logs, f"[집계] 추출 문구 수: {len(text_candidates)}개 "
               f"(재사용 가능: {sum(1 for c in text_candidates if c.usable)}개)")
    content_library = build_content_library(text_candidates, max_per_purpose=20)

    # ---------- 4. 민감정보 제거 ----------
    _report(progress_cb, STAGES_V2[3])
    for img in all_images:
        evaluate_image(img, blacklist)
    banned_count = sum(1 for i in all_images if i.banned)
    _log(logs, f"[집계] 민감정보로 배제된 이미지: {banned_count}장")

    # ---------- 5. 분류 + 중복 제거 + 전후 탐지 + 등급 산정 ----------
    _report(progress_cb, STAGES_V2[4])
    classify_all(all_images)
    dedupe_images(all_images)
    dup_count = sum(1 for i in all_images if i.is_duplicate_of)
    detect_before_after_pairs(all_images, all_slides)
    attach_real_captions(all_images, text_candidates)

    a_list, b_list, c_list = grade_all(all_images, family_of)
    _log(logs, f"[집계] 사진 등급 분류 - A(핵심/필수) {len(a_list)}장, "
               f"B(선택적 활용 가능) {len(b_list)}장, C(제외) {len(c_list)}장")
    for img in c_list:
        _log(logs, f"  · C등급 제외: {img.source_file} 슬라이드{img.slide_index+1} - {img.grade_reason}")

    images_by_id = {i.id: i for i in all_images}
    usable_for_story = [i for i in all_images if i.grade in ("A", "B")]

    # ---------- 6. 관계 분석 + 그룹핑(같은 공정은 파일 간 자동 통합) ----------
    _report(progress_cb, STAGES_V2[5])
    relationships = inv.build_image_text_relationships(all_images, text_candidates)
    groups = build_groups(usable_for_story, text_candidates)
    _log(logs, f"[집계] 콘텐츠 그룹(공정/사건 단위, 파일 간 동일 공정 통합 후) 수: {len(groups)}개")

    cover_id = cs.select_cover_image(all_images)
    cover_image = images_by_id.get(cover_id) if cover_id else None
    ba_pairs = cs.build_before_after_cases(all_images, max_cases=10)

    # ---------- 7. 스토리 구성 (품질 미달 시 조건을 바꿔 재구성, 최대 3회) ----------
    _report(progress_cb, STAGES_V2[6])
    attempt = 0
    settings = {}
    quality_report = None
    pages = None
    out_pptx = os.path.join(output_dir, f"{safe_name}_{work_type}_입주민설명자료.pptx")
    while attempt < 3:
        attempt += 1
        for img in all_images:
            img.selected = False
            img.selected_slide = None
            img.caption_is_original = False
        used_ids = set()
        pages = build_pages(apartment_name, work_type, groups, content_library, ba_pairs,
                              cover_image, used_ids, images_by_id, settings=settings)
        _log(logs, f"[시도 {attempt}] 스토리 구성 완료 - 총 {len(pages)}페이지 (설정: {settings or '기본값'})")

        generate_pptx_v2(pages, images_by_id, out_pptx)
        report = validate_and_fix(out_pptx, blacklist, apartment_name)

        used_original_phrases = {b for p in pages for b in p.get("bullets", [])}
        quality_report = qmod.compute_quality(all_images, pages, content_library,
                                                used_original_phrases, report)
        _log(logs, f"[시도 {attempt}] 품질 점수: {quality_report.total}/100 "
                   f"({'PASS' if quality_report.passed else 'FAIL'})")
        if quality_report.passed or attempt >= 3:
            break
        _log(logs, f"[시도 {attempt}] 기준 미달 사유: {', '.join(quality_report.fail_reasons)}")
        settings = _adjust_settings_for_retry(settings, quality_report, content_library, logs)

    _report(progress_cb, STAGES_V2[7])

    # ---------- 8. 검수 (최종본 재검수) ----------
    _report(progress_cb, STAGES_V2[8])
    final_validation = validate_and_fix(out_pptx, blacklist, apartment_name)

    # ---------- 9. 품질 평가 결과 + 원본 인벤토리 저장 ----------
    _report(progress_cb, STAGES_V2[9])
    debug_dir = os.path.join(output_dir, f"{safe_name}_중간산출물")
    os.makedirs(debug_dir, exist_ok=True)
    dd.dump_image_extraction_folder(all_images, debug_dir)
    inv.dump_source_slides_csv(all_slides, os.path.join(debug_dir, "source_slides.csv"))
    inv.dump_source_images_csv(all_images, os.path.join(debug_dir, "source_images.csv"))
    inv.dump_source_texts_csv(text_candidates, relationships, os.path.join(debug_dir, "source_texts.csv"))
    inv.dump_image_text_relationships_csv(relationships,
                                            os.path.join(debug_dir, "image_text_relationships.csv"))
    inv.dump_unused_content_csv(all_images, text_candidates, os.path.join(debug_dir, "unused_content.csv"))
    inv.dump_content_groups_json(groups_to_json(groups), os.path.join(debug_dir, "content_groups.json"))
    inv.dump_slide_content_mapping_csv(pages, os.path.join(debug_dir, "slide_content_mapping.csv"))
    # 요청된 정확한 파일명(v1 호환) 별도 생성
    dd.dump_image_classification_csv(all_images, os.path.join(debug_dir, "이미지분류.csv"))
    dd.dump_extracted_text_csv(text_candidates, os.path.join(debug_dir, "extracted_text.csv"))

    quality_json_path = os.path.join(output_dir, f"{safe_name}_품질평가.json")
    with open(quality_json_path, "w", encoding="utf-8") as f:
        json.dump({
            "total": quality_report.total, "passed": quality_report.passed,
            "scores": quality_report.scores, "metrics": quality_report.metrics,
            "fail_reasons": quality_report.fail_reasons, "attempts": attempt,
        }, f, ensure_ascii=False, indent=2)
    with open(os.path.join(debug_dir, "품질점수.txt"), "w", encoding="utf-8") as f:
        f.write(qmod.report_text(quality_report))

    # ---------- 10. 시각 검증 ----------
    _report(progress_cb, STAGES_V2[10])
    pdf_path = convert_to_pdf(out_pptx, output_dir)
    contact_sheet_path, slide_png_paths = (None, [])
    visual = None
    if pdf_path:
        wanted_pdf = os.path.join(output_dir, f"{safe_name}_{work_type}_입주민설명자료.pdf")
        if pdf_path != wanted_pdf:
            os.replace(pdf_path, wanted_pdf)
            pdf_path = wanted_pdf
        render_dir = os.path.join(debug_dir, "슬라이드렌더링")
        os.makedirs(render_dir, exist_ok=True)
        contact_sheet_path, slide_png_paths = rc.render_slides_and_contact_sheet(pdf_path, render_dir, safe_name)
        visual = rc.visual_validation(out_pptx)
        rc.dump_visual_validation_json(visual, os.path.join(debug_dir, "visual_validation.json"))
        _log(logs, f"시각 검증 완료 - contact_sheet: {contact_sheet_path}")

        wanted_contact_sheet = os.path.join(output_dir, f"{safe_name}_contact_sheet.png")
        if contact_sheet_path and os.path.exists(contact_sheet_path):
            import shutil
            shutil.copy2(contact_sheet_path, wanted_contact_sheet)
            contact_sheet_path = wanted_contact_sheet
    else:
        _log(logs, "LibreOffice를 찾을 수 없어 PDF/시각 검증을 건너뛰었습니다.")

    inserted_count = sum(s["picture_count"] for s in visual["slides"]) if visual else \
        sum(1 for i in all_images if i.selected)
    total_ab = len(a_list) + len(b_list)
    _log(logs, f"[집계] 최종 페이지 수: {len(pages) - 1}")
    _log(logs, f"[집계] 실제 PPT 삽입 이미지 수(재오픈 검증): {inserted_count}장")
    _log(logs, f"[집계] 사진 활용률(A+B 대비): "
               f"{inserted_count/total_ab*100 if total_ab else 100:.1f}%")
    a_selected = sum(1 for i in a_list if i.selected)
    _log(logs, f"[집계] A등급 활용률: {a_selected}/{len(a_list)} "
               f"({a_selected/len(a_list)*100 if a_list else 100:.1f}%)")
    _log(logs, f"[집계] 원본 문구 활용률: {quality_report.metrics.get('text_utilization', 0)*100:.1f}%")
    _log(logs, f"[집계] 최종 품질 점수: {quality_report.total}/100 ({'PASS' if quality_report.passed else 'FAIL'}) "
               f"- 총 {attempt}회 시도")

    report_path = os.path.join(output_dir, f"{safe_name}_검수결과.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(final_validation.as_text())
        f.write("\n\n")
        f.write(qmod.report_text(quality_report))

    log_path = os.path.join(output_dir, f"{safe_name}_처리로그.txt")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(logs))

    _report(progress_cb, STAGES_V2[11])

    warnings = list(quality_report.fail_reasons)
    if c_list:
        warnings.append(f"민감정보/중복/저해상도로 제외된 사진 {len(c_list)}장 "
                          f"(상세: {debug_dir}/unused_content.csv)")

    return {
        "pptx": out_pptx,
        "pdf": pdf_path,
        "preview_png": contact_sheet_path,
        "log": log_path,
        "validation_report": report_path,
        "quality_json": quality_json_path,
        "debug_dir": debug_dir,
        "inserted_image_count": inserted_count,
        "total_usable_image_count": total_ab,
        "a_grade_count": len(a_list),
        "b_grade_count": len(b_list),
        "c_grade_count": len(c_list),
        "quality_score": quality_report.total,
        "quality_passed": quality_report.passed,
        "attempts": attempt,
        "warnings": warnings,
        "validation": final_validation,
        "temp_dir": temp_root,
        "page_count": len(pages) - 1,
        "pipeline": PIPELINE_NAME,
        "commit": commit,
    }
