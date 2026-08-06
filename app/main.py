# -*- coding: utf-8 -*-
"""
자동화 자료취합 - 파이프라인 진입점 + CLI.

실제 생성 로직은 app.engine.pipeline.run_pipeline_v2 (콘텐츠 중심 v2 엔진)에 있다.
이전의 고정 템플릿 방식(v1)은 app/legacy/pipeline_v1.py 에 보존되어 있으며 기본
경로에서는 더 이상 사용되지 않는다.

사용법:
    python -m app.main --apt "행복아파트" --work 재도장 --output ./output file1.pptx file2.pptx [file3.pptx]
"""
import argparse
import sys
import traceback

from app.engine.pipeline import STAGES_V2 as STAGES
from app.engine.pipeline import run_pipeline_v2 as run_pipeline
from app.utils.pdf_tools import build_preview_image, convert_to_pdf  # noqa: F401 (engine/GUI에서 재사용)


def main():
    parser = argparse.ArgumentParser(description="자동화 자료취합")
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
    for k in ("pptx", "pdf", "preview_png", "log", "validation_report", "debug_dir",
              "quality_score", "quality_passed", "inserted_image_count", "total_usable_image_count"):
        print(f"{k}: {result.get(k)}")
    if result["warnings"]:
        print("\n[확인 필요]")
        for w in result["warnings"]:
            print(f" - {w}")


if __name__ == "__main__":
    main()
