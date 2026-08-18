# -*- coding: utf-8 -*-
"""
자동화 자료취합 - 데스크톱 GUI (CustomTkinter 기반)

[2026-08 v3 개편] 프로젝트 방향 전환에 따라 기본 화면을 "① 자동 생성"(현장사진만
올리면 공종/사진역할을 자동판별해 회사 지식자료와 매칭, 스토리 구성까지 자동으로
하는 흐름)으로 바꾸고, 기존 "기존 PPT 2~3개 입력" 흐름은 완전히 삭제하지 않고
"② 관리자(기존 방식)" 탭으로 이동시켰다(요청사항 17/18/22 - 기존 기능 보존).

[재설계 - 2026-08] "Windows 11 기본 프로그램"처럼 단순하고 깔끔하게 보이는 것이
목표다. 개발툴처럼 보이면 안 된다: 회색 박스/불필요한 테두리를 걷어내고, 여백을
넉넉히 주고, 파일 목록은 파일명만 짧게 보여준다.
Windows 10/11에서 Python 없이도 동작하도록 PyInstaller로 패키징하는 것을 전제로 한다.
"""
import json
import os
import shutil
import subprocess
import sys
import threading
import traceback
import uuid
import zipfile

import customtkinter as ctk
from tkinter import filedialog, messagebox

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.engine.site_photos import SUPPORTED_EXTS as SITE_PHOTO_EXTS
from app.engine.site_photos import validate_site_photo_paths
from app.main import STAGES, STAGES_PHOTO, run_pipeline, run_pipeline_photo
from app.utils.config import WORK_TYPES
from app.utils.input_validation import inspect_file, is_legacy_ppt, validate_input_paths
from app.utils.paths import default_output_dir, knowledge_library_dir, work_root
from app.utils.version import get_build_commit

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    _DND_AVAILABLE = True
except Exception:
    _DND_AVAILABLE = False

ctk.set_appearance_mode("light")

# ------------------------------------------------------------------
# Windows 11 느낌의 절제된 디자인 토큰: 흰 배경 + 남색 버튼, 회색 박스/불필요한 선 제거
# ------------------------------------------------------------------
FONT_FAMILY = "맑은 고딕"
COLOR_NAVY = "#12233F"
COLOR_NAVY_HOVER = "#1C355C"
COLOR_BORDER = "#E4E6EA"
COLOR_TEXT = "#1F2430"
COLOR_SUBTEXT = "#7A8090"
COLOR_BG = "#FFFFFF"
COLOR_HOVER = "#F4F5F7"
COLOR_GOLD = "#B08D57"

MAX_FILES = 3
MIN_FILES = 2
MAX_SITE_PHOTOS = 10
MAX_AUTO_SITE_PHOTOS = 30
AUTO_WORK_OPTION = "자동분석"

WIN_W, WIN_H = 560, 760


def _f(size, weight="normal"):
    return ctk.CTkFont(family=FONT_FAMILY, size=size, weight=weight)


class AutoMaterialApp(ctk.CTk if not _DND_AVAILABLE else TkinterDnD.Tk):
    def __init__(self):
        super().__init__()
        self.title("자동화 자료취합")
        try:
            self.configure(fg_color=COLOR_BG)
        except Exception:
            self.configure(bg=COLOR_BG)
        self._center(WIN_W, WIN_H)
        self.resizable(False, False)

        # ---- 관리자(기존 PPT 방식) 탭 상태 ----
        self.selected_files = []       # 화면 표시용: 사용자가 실제로 선택한 원본 경로
        self.selected_work_paths = []  # 실제 처리용: 선택 즉시 안전한 작업폴더로 복사한 경로
        self.selection_logs = []       # 선택 시점 경로추적 로그(실행 시 처리로그에 포함됨)
        self.site_photo_paths = []       # 화면 표시용: 현장사진 원본 경로(선택사항)
        self.site_photo_work_paths = []  # 실제 처리용: 현장사진 안전 복사본 경로
        self.output_dir = default_output_dir()
        self.result = None
        self._log_visible = False

        # ---- 자동 생성 탭 상태 ----
        self.auto_site_photo_paths = []
        self.auto_site_photo_work_paths = []
        self.auto_output_dir = default_output_dir()
        self.knowledge_dir = knowledge_library_dir()
        self.auto_result = None
        self._auto_log_visible = False

        self.build_commit = get_build_commit()

        self._build_ui()

    def _center(self, w, h):
        self.update_idletasks()
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        x, y = (sw - w) // 2, (sh - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

    # ------------------------------------------------------------------
    def _section_label(self, parent, text):
        return ctk.CTkLabel(parent, text=text, font=_f(12, "bold"), text_color=COLOR_TEXT, anchor="w")

    def _hint_label(self, parent, text):
        return ctk.CTkLabel(parent, text=text, font=_f(11), text_color=COLOR_SUBTEXT, anchor="w")

    def _entry(self, parent, placeholder="", height=36):
        return ctk.CTkEntry(
            parent, placeholder_text=placeholder, height=height, corner_radius=8,
            border_width=1, border_color=COLOR_BORDER, fg_color=COLOR_BG,
            text_color=COLOR_TEXT, font=_f(13),
        )

    def _secondary_button(self, parent, text, command, width=96, height=30):
        return ctk.CTkButton(
            parent, text=text, command=command, width=width, height=height,
            corner_radius=8, fg_color="transparent", hover_color=COLOR_HOVER,
            border_width=1, border_color=COLOR_BORDER, text_color=COLOR_NAVY,
            font=_f(12),
        )

    def _divider(self, parent):
        ctk.CTkFrame(parent, height=1, fg_color=COLOR_BORDER).pack(fill="x")

    def _file_row(self, parent, label, on_remove):
        row = ctk.CTkFrame(parent, fg_color=COLOR_BG, height=28)
        row.pack(fill="x", pady=1)
        row.pack_propagate(False)
        ctk.CTkLabel(row, text=label, font=_f(12), text_color=COLOR_TEXT,
                      anchor="w").pack(side="left", fill="x", expand=True)
        ctk.CTkButton(row, text="✕", width=22, height=22, corner_radius=6,
                       fg_color="transparent", hover_color=COLOR_HOVER, text_color=COLOR_SUBTEXT,
                       font=_f(11), command=on_remove).pack(side="right")

    # ==================================================================
    # 전체 레이아웃: 탭 2개(자동 생성 - 기본 선택 / 관리자 - 기존 방식)
    # ==================================================================
    def _build_ui(self):
        header = ctk.CTkFrame(self, fg_color=COLOR_BG)
        header.pack(fill="x", padx=20, pady=(14, 0))
        ctk.CTkLabel(header, text="자동화 자료취합",
                     font=_f(19, "bold"), text_color=COLOR_TEXT, anchor="w").pack(side="left")
        ctk.CTkLabel(header, text=f"v.{self.build_commit}", font=_f(10),
                     text_color=COLOR_SUBTEXT, anchor="e").pack(side="right", pady=(6, 0))

        self.tabview = ctk.CTkTabview(
            self, fg_color=COLOR_BG, segmented_button_fg_color=COLOR_HOVER,
            segmented_button_selected_color=COLOR_NAVY, segmented_button_selected_hover_color=COLOR_NAVY_HOVER,
            segmented_button_unselected_color=COLOR_HOVER, segmented_button_unselected_hover_color=COLOR_HOVER,
            text_color=COLOR_TEXT, corner_radius=10,
        )
        self.tabview.pack(fill="both", expand=True, padx=14, pady=(8, 14))
        auto_tab = self.tabview.add("① 자동 생성")
        admin_tab = self.tabview.add("② 관리자(기존 방식)")
        self.tabview.set("① 자동 생성")

        self._build_auto_tab(auto_tab)
        self._build_admin_tab(admin_tab)

    # ==================================================================
    # ① 자동 생성 탭 (요청사항 1/17) - 현장사진만 올리면 자동으로 결과물 생성
    # ==================================================================
    def _build_auto_tab(self, parent):
        bottom = ctk.CTkFrame(parent, fg_color=COLOR_BG)
        bottom.pack(fill="x", side="bottom", padx=6, pady=(8, 6))
        self.auto_run_btn = ctk.CTkButton(
            bottom, text="설명자료 만들기", height=42, corner_radius=10,
            fg_color=COLOR_NAVY, hover_color=COLOR_NAVY_HOVER, text_color="white",
            font=_f(14, "bold"), command=self._on_auto_run,
        )
        self.auto_run_btn.pack(fill="x")

        body = ctk.CTkFrame(parent, fg_color=COLOR_BG)
        body.pack(fill="both", expand=True, padx=6, pady=(6, 0))

        self._hint_label(body, "현장사진만 올리면 공종/사진 역할을 자동 판별하고, "
                                  "회사 지식자료를 자동으로 찾아 새 입주민 설명자료를 만듭니다.").pack(
            fill="x", pady=(0, 10))

        self._section_label(body, "새 아파트명").pack(fill="x")
        self.auto_apt_entry = self._entry(body, "예) 은하수아파트")
        self.auto_apt_entry.pack(fill="x", pady=(4, 10))

        self._divider(body)

        row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        row.pack(fill="x", pady=(10, 2))
        self._section_label(row, "현장사진").pack(side="left")
        self.auto_photo_count_label = self._hint_label(row, "0장 선택됨")
        self.auto_photo_count_label.pack(side="right")
        btn_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        btn_row.pack(fill="x", pady=(2, 4))
        self._secondary_button(btn_row, "+ 사진 추가", self._add_auto_site_photos, width=100, height=28).pack(side="left")

        photo_list_wrap = ctk.CTkFrame(body, fg_color=COLOR_BG, height=110)
        photo_list_wrap.pack(fill="x", pady=(2, 10))
        photo_list_wrap.pack_propagate(False)
        self.auto_photo_list_frame = ctk.CTkScrollableFrame(
            photo_list_wrap, fg_color=COLOR_BG, corner_radius=8,
            scrollbar_button_color=COLOR_BORDER, scrollbar_button_hover_color=COLOR_SUBTEXT,
        )
        self.auto_photo_list_frame.pack(fill="both", expand=True)

        self._divider(body)

        # ---------- 공종(기본값: 자동분석) ----------
        wt_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        wt_row.pack(fill="x", pady=(10, 2))
        self._section_label(wt_row, "공종").pack(side="left")
        self._secondary_button(wt_row, "분석 결과 확인", self._on_preview_analysis,
                                 width=110, height=26).pack(side="right")
        self.auto_work_var = ctk.StringVar(value=AUTO_WORK_OPTION)
        self.auto_work_menu = ctk.CTkOptionMenu(
            body, values=[AUTO_WORK_OPTION] + WORK_TYPES, variable=self.auto_work_var,
            height=34, corner_radius=8, fg_color=COLOR_BG, button_color=COLOR_BG,
            button_hover_color=COLOR_HOVER, text_color=COLOR_TEXT, dropdown_fg_color=COLOR_BG,
            dropdown_text_color=COLOR_TEXT, dropdown_hover_color=COLOR_HOVER, font=_f(13),
        )
        self.auto_work_menu.pack(fill="x", pady=(4, 4))
        self._hint_label(body, "기본값은 자동분석입니다. 판정이 다르면 직접 선택할 수 있습니다.").pack(
            fill="x", pady=(0, 6))

        self.analysis_result_label = ctk.CTkLabel(
            body, text="", font=_f(11), text_color=COLOR_SUBTEXT, anchor="w", justify="left")
        self.analysis_result_label.pack(fill="x", pady=(0, 6))

        self._divider(body)

        # ---------- 회사 기존자료 ----------
        kn_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        kn_row.pack(fill="x", pady=(10, 2))
        self._section_label(kn_row, "회사 기존자료").pack(side="left")
        self.auto_use_knowledge_var = ctk.BooleanVar(value=True)
        ctk.CTkCheckBox(kn_row, text="자동 검색", variable=self.auto_use_knowledge_var,
                          font=_f(12), text_color=COLOR_TEXT, checkbox_width=18, checkbox_height=18,
                          fg_color=COLOR_NAVY, hover_color=COLOR_NAVY_HOVER).pack(side="right")
        self._hint_label(body, f"등록 위치: {self.knowledge_dir}").pack(fill="x", pady=(2, 4))
        self._secondary_button(body, "회사 자료 등록은 [② 관리자] 탭에서",
                                 lambda: self.tabview.set("② 관리자(기존 방식)"),
                                 width=220, height=26).pack(anchor="w", pady=(0, 8))

        self._divider(body)

        self._section_label(body, "출력 폴더").pack(fill="x", pady=(10, 4))
        out_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        out_row.pack(fill="x", pady=(0, 10))
        self.auto_out_entry = self._entry(out_row, height=32)
        self.auto_out_entry.insert(0, self.auto_output_dir)
        self.auto_out_entry.pack(side="left", fill="x", expand=True)
        self._secondary_button(out_row, "찾아보기", self._choose_auto_output, width=76, height=32).pack(
            side="left", padx=(6, 0))

        self._divider(body)

        progress_wrap = ctk.CTkFrame(body, fg_color=COLOR_BG)
        progress_wrap.pack(fill="x", pady=(10, 2))
        self.auto_progress_bar = ctk.CTkProgressBar(progress_wrap, height=6, corner_radius=3,
                                                       progress_color=COLOR_NAVY, fg_color=COLOR_HOVER)
        self.auto_progress_bar.set(0)
        self.auto_progress_bar.pack(fill="x")
        self.auto_status_label = ctk.CTkLabel(progress_wrap, text="대기 중", font=_f(12),
                                                 text_color=COLOR_SUBTEXT, anchor="w")
        self.auto_status_label.pack(fill="x", pady=(4, 0))

        self.auto_log_toggle_btn = ctk.CTkButton(
            body, text="▼ 상세 로그 보기", command=self._toggle_auto_log, height=20,
            corner_radius=6, fg_color="transparent", hover_color=COLOR_HOVER,
            border_width=0, text_color=COLOR_SUBTEXT, font=_f(11), anchor="w",
        )
        self.auto_log_toggle_btn.pack(fill="x", pady=(2, 0))
        self.auto_log_box = ctk.CTkTextbox(body, height=90, corner_radius=8, border_width=1,
                                             border_color=COLOR_BORDER, font=_f(11))
        self.auto_log_box.configure(state="disabled")

        self.auto_post_frame = ctk.CTkFrame(body, fg_color=COLOR_BG)
        self.auto_open_result_btn = self._secondary_button(
            self.auto_post_frame, "결과 PPT 열기", self._open_auto_result, width=150, height=34)
        self.auto_open_folder_btn = self._secondary_button(
            self.auto_post_frame, "저장폴더 열기", self._open_auto_folder, width=150, height=34)
        self.auto_open_result_btn.grid(row=0, column=0, padx=(0, 6), sticky="ew")
        self.auto_open_folder_btn.grid(row=0, column=1, padx=(6, 0), sticky="ew")
        self.auto_post_frame.grid_columnconfigure(0, weight=1)
        self.auto_post_frame.grid_columnconfigure(1, weight=1)

        self._refresh_auto_photo_list()

    def _toggle_auto_log(self):
        self._auto_log_visible = not self._auto_log_visible
        if self._auto_log_visible:
            self.auto_log_box.pack(fill="x", pady=(4, 0), after=self.auto_log_toggle_btn)
            self.auto_log_toggle_btn.configure(text="▲ 상세 로그 보기")
        else:
            self.auto_log_box.pack_forget()
            self.auto_log_toggle_btn.configure(text="▼ 상세 로그 보기")

    def _refresh_auto_photo_list(self):
        for w in self.auto_photo_list_frame.winfo_children():
            w.destroy()
        for path in self.auto_site_photo_paths:
            self._file_row(self.auto_photo_list_frame, os.path.basename(path),
                             lambda p=path: self._remove_auto_site_photo(p))
        n = len(self.auto_site_photo_paths)
        self.auto_photo_count_label.configure(text=f"{n}장 선택됨" if n else "0장 선택됨")

    def _register_auto_site_photo(self, original_path: str):
        if original_path in self.auto_site_photo_paths or len(self.auto_site_photo_paths) >= MAX_AUTO_SITE_PHOTOS:
            return
        ext = os.path.splitext(original_path)[1].lower()
        if ext not in SITE_PHOTO_EXTS:
            messagebox.showerror("파일 오류", f"지원하지 않는 사진 형식입니다: {os.path.basename(original_path)}")
            return
        info = inspect_file(original_path)
        if not info["exists"] or not info["is_file"] or info["size_bytes"] == 0:
            messagebox.showerror("파일 오류", f"사진을 사용할 수 없습니다: {os.path.basename(original_path)}")
            return
        try:
            safe_dir = os.path.join(work_root(), "auto_site_photos")
            os.makedirs(safe_dir, exist_ok=True)
            work_path = os.path.join(safe_dir, f"{uuid.uuid4().hex[:8]}_{os.path.basename(original_path)}")
            shutil.copy2(original_path, work_path)
        except Exception as e:
            messagebox.showerror("파일 오류", f"사진을 안전한 작업 폴더로 복사하지 못했습니다:\n{e}")
            return
        if not (os.path.exists(work_path) and os.path.getsize(work_path) > 0):
            messagebox.showerror("파일 오류", "사진 복사에 실패했습니다. 다시 선택해주세요.")
            return
        self.auto_site_photo_paths.append(original_path)
        self.auto_site_photo_work_paths.append(work_path)

    def _add_auto_site_photos(self):
        paths = filedialog.askopenfilenames(
            title="현장사진 선택", filetypes=[("이미지 파일", "*.jpg *.jpeg *.png *.webp")])
        for p in paths:
            self._register_auto_site_photo(p)
        self._refresh_auto_photo_list()

    def _remove_auto_site_photo(self, path):
        if path in self.auto_site_photo_paths:
            idx = self.auto_site_photo_paths.index(path)
            del self.auto_site_photo_paths[idx]
            if idx < len(self.auto_site_photo_work_paths):
                del self.auto_site_photo_work_paths[idx]
        self._refresh_auto_photo_list()

    def _choose_auto_output(self):
        d = filedialog.askdirectory(title="결과물 저장 폴더 선택")
        if d:
            self.auto_output_dir = d
            self.auto_out_entry.delete(0, "end")
            self.auto_out_entry.insert(0, d)

    def _auto_log(self, msg):
        self.auto_log_box.configure(state="normal")
        self.auto_log_box.insert("end", msg + "\n")
        self.auto_log_box.see("end")
        self.auto_log_box.configure(state="disabled")

    def _set_auto_stage(self, stage):
        idx = STAGES_PHOTO.index(stage) if stage in STAGES_PHOTO else 0
        self.auto_progress_bar.set((idx + 1) / len(STAGES_PHOTO))
        self.auto_status_label.configure(text=stage)
        self._auto_log(f"[진행] {stage}")

    def _on_preview_analysis(self):
        """요청사항 19: PPT 생성 전 사진 분석 결과만 빠르게 미리 확인한다."""
        if not self.auto_site_photo_work_paths:
            messagebox.showwarning("입력 확인", "먼저 현장사진을 추가해주세요.")
            return
        self.analysis_result_label.configure(text="분석 중...")

        def worker():
            try:
                import tempfile
                from app.engine.site_photos import load_and_analyze_site_photos
                from app.photo_analyzer.analyzer import build_analysis_summary
                tmp_dir = os.path.join(work_root(), f"preview_{uuid.uuid4().hex[:8]}")
                imgs = load_and_analyze_site_photos(list(self.auto_site_photo_work_paths), tmp_dir)
                summary = build_analysis_summary(imgs)
                lines = [f"총 사진 {summary['total_photos']}장 (중복 {summary['duplicate_photos']}, "
                         f"미분류 {summary['unknown_photos']})"]
                for wt, pct in summary["work_type_percentages"][:4]:
                    from app.utils.config import work_type_label
                    lines.append(f"  {work_type_label(wt)} {pct}%")
                lines.append(f"주 공종: {summary['primary_work_type_label']}")
                role_line = ", ".join(f"{k}:{v}" for k, v in summary["role_counts"].items())
                lines.append(f"역할별: {role_line}")
                self.after(0, lambda: self.analysis_result_label.configure(text="\n".join(lines)))
            except Exception as e:
                self.after(0, lambda: self.analysis_result_label.configure(text=f"분석 실패: {e}"))

        threading.Thread(target=worker, daemon=True).start()

    def _on_auto_run(self):
        apt = self.auto_apt_entry.get().strip()
        out_dir = self.auto_out_entry.get().strip() or self.auto_output_dir
        if not out_dir:
            out_dir = default_output_dir()
            self.auto_out_entry.delete(0, "end")
            self.auto_out_entry.insert(0, out_dir)

        if not apt:
            messagebox.showwarning("입력 확인", "새 아파트명을 입력해주세요.")
            return
        if not self.auto_site_photo_work_paths:
            messagebox.showwarning("입력 확인", "현장사진을 1장 이상 추가해주세요.")
            return

        try:
            validate_site_photo_paths(self.auto_site_photo_work_paths)
        except ValueError as e:
            messagebox.showerror("현장사진 오류", str(e))
            return

        work_choice = self.auto_work_var.get()
        work_override = None if work_choice == AUTO_WORK_OPTION else work_choice

        self.auto_run_btn.configure(state="disabled", text="생성 중...")
        self.auto_post_frame.pack_forget()
        self.auto_log_box.configure(state="normal")
        self.auto_log_box.delete("1.0", "end")
        self.auto_log_box.configure(state="disabled")

        t = threading.Thread(target=self._auto_run_worker, args=(apt, out_dir, work_override), daemon=True)
        t.start()

    def _auto_run_worker(self, apt, out_dir, work_override):
        try:
            result = run_pipeline_photo(
                apt, list(self.auto_site_photo_work_paths), self.knowledge_dir, out_dir,
                work_type_override=work_override,
                progress_cb=lambda s: self.after(0, self._set_auto_stage, s),
            )
            pptx_path = result.get("pptx")
            if not pptx_path or not os.path.exists(pptx_path) or os.path.getsize(pptx_path) == 0:
                self.after(0, self._on_auto_ppt_failure,
                           f"파이프라인은 끝까지 실행됐지만 최종 PPT 파일을 찾을 수 없습니다.\n"
                           f"예상 경로: {pptx_path}\n처리 로그: {result.get('log')}")
                return
            self.auto_result = result
            self.after(0, self._on_auto_success, result)
        except Exception as e:
            traceback.print_exc()
            is_ppt_failure = type(e).__name__ == "PptGenerationFailedError"
            self.after(0, self._on_auto_ppt_failure if is_ppt_failure else self._on_auto_failure, str(e))

    def _on_auto_success(self, result):
        self.auto_run_btn.configure(state="normal", text="설명자료 만들기")
        self.auto_post_frame.pack(fill="x", pady=(12, 0))
        self._auto_log("\n=== 생성 완료 ===")
        self._auto_log(f"PPTX: {result['pptx']}")
        self._auto_log(f"판정된 공종: {result.get('work_type_detected')}")
        for wt, pct in result.get("work_type_percentages", []):
            self._auto_log(f"  - {wt}: {pct}%")
        self._auto_log(f"지식자료 활용: 문구 {result.get('knowledge_entry_count', 0)}건, "
                        f"사진 {result.get('knowledge_image_count', 0)}장")
        stats = result.get("template_engine_stats")
        if stats:
            self._auto_log(f"\n템플릿 엔진 사용: 전체 {stats['total_content_pages']}페이지 중 "
                            f"{stats['template_page_count']}페이지가 디자이너 제작 템플릿 사용 "
                            f"(사용률 {stats['template_usage_ratio']*100:.0f}%).")
        if result.get("warnings"):
            self._auto_log("\n[확인이 필요한 항목]")
            for w in result["warnings"]:
                self._auto_log(f" - {w}")
        messagebox.showinfo("완료", f"새 자료 생성이 완료되었습니다.\n판정된 공종: {result.get('work_type_detected')}")

    def _on_auto_failure(self, msg):
        self.auto_run_btn.configure(state="normal", text="설명자료 만들기")
        self._auto_log(f"\n[오류] {msg}")
        messagebox.showerror("오류", f"처리 중 오류가 발생했습니다:\n{msg}")

    def _on_auto_ppt_failure(self, msg):
        self.auto_run_btn.configure(state="normal", text="설명자료 만들기")
        self.auto_status_label.configure(text="PPT 생성 실패")
        self._auto_log(f"\n[PPT 생성 실패] {msg}")
        messagebox.showerror("PPT 생성 실패", f"최종 PPT 생성에 실패했습니다.\n\n{msg}")

    def _open_auto_result(self):
        if self.auto_result and self.auto_result.get("pptx") and os.path.exists(self.auto_result["pptx"]):
            self._open_path(self.auto_result["pptx"])

    def _open_auto_folder(self):
        if self.auto_result and self.auto_result.get("pptx"):
            self._open_path(os.path.dirname(self.auto_result["pptx"]))

    # ==================================================================
    # ② 관리자 탭 (기존 방식: 기존 PPT 2~3개 입력 - 요청사항 18, 기존 기능 그대로 보존)
    # ==================================================================
    def _build_admin_tab(self, parent):
        bottom = ctk.CTkFrame(parent, fg_color=COLOR_BG)
        bottom.pack(fill="x", side="bottom", padx=6, pady=(8, 6))
        self.run_btn = ctk.CTkButton(
            bottom, text="새 자료 만들기", height=42, corner_radius=10,
            fg_color=COLOR_NAVY, hover_color=COLOR_NAVY_HOVER, text_color="white",
            font=_f(14, "bold"), command=self._on_run,
        )
        self.run_btn.pack(fill="x")

        body = ctk.CTkFrame(parent, fg_color=COLOR_BG)
        body.pack(fill="both", expand=True, padx=6, pady=(6, 0))

        self._hint_label(body, "기존 PPT 2~3개를 분석하여 새로운 입주민 설명자료를 자동 생성합니다.\n"
                                  "(회사 자료를 지식자료로 등록하려면 아래에서 폴더를 여세요.)").pack(
            fill="x", pady=(0, 10))

        kn_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        kn_row.pack(fill="x", pady=(0, 10))
        self._section_label(kn_row, "회사 지식자료(Knowledge Library) 등록").pack(side="left")
        self._secondary_button(kn_row, "폴더 열기", self._open_knowledge_folder, width=90, height=26).pack(side="right")
        self._hint_label(body, f"{self.knowledge_dir}\n"
                                  "위 폴더 안의 repainting/waterproof/parking/repair/asphalt/metal_roof "
                                  "폴더에 회사가 보유한 PPT를 넣어두면 [① 자동 생성]에서 자동으로 검색됩니다.").pack(
            fill="x", pady=(0, 10))

        self._divider(body)

        # ---------- 새 아파트명 / 공종 ----------
        apt_work_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        apt_work_row.pack(fill="x", pady=(10, 10))
        apt_col = ctk.CTkFrame(apt_work_row, fg_color=COLOR_BG)
        apt_col.pack(side="left", fill="x", expand=True)
        self._section_label(apt_col, "새 아파트명").pack(fill="x")
        self.apt_entry = self._entry(apt_col, "예) 은하수아파트")
        self.apt_entry.pack(fill="x", pady=(4, 0))

        work_col = ctk.CTkFrame(apt_work_row, fg_color=COLOR_BG)
        work_col.pack(side="left", padx=(10, 0))
        self._section_label(work_col, "공종").pack(fill="x")
        self.work_var = ctk.StringVar(value=WORK_TYPES[0])
        self.work_menu = ctk.CTkOptionMenu(
            work_col, values=WORK_TYPES, variable=self.work_var, height=34, width=110, corner_radius=8,
            fg_color=COLOR_BG, button_color=COLOR_BG, button_hover_color=COLOR_HOVER,
            text_color=COLOR_TEXT, dropdown_fg_color=COLOR_BG, dropdown_text_color=COLOR_TEXT,
            dropdown_hover_color=COLOR_HOVER, font=_f(13), dropdown_font=_f(12),
        )
        self.work_menu.pack(fill="x", pady=(4, 0))

        self._divider(body)

        # ---------- ① 기존 PPT 추가 ----------
        row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        row.pack(fill="x", pady=(10, 2))
        self._section_label(row, "① 기존 PPT 추가 (2~3개)").pack(side="left")
        self.file_count_label = self._hint_label(row, "")
        self.file_count_label.pack(side="right")
        ppt_btn_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        ppt_btn_row.pack(fill="x", pady=(2, 4))
        self._secondary_button(ppt_btn_row, "파일 선택", self._add_files, width=100, height=28).pack(side="left")

        file_list_wrap = ctk.CTkFrame(body, fg_color=COLOR_BG, height=58)
        file_list_wrap.pack(fill="x", pady=(2, 10))
        file_list_wrap.pack_propagate(False)
        self.file_list_frame = ctk.CTkScrollableFrame(
            file_list_wrap, fg_color=COLOR_BG, corner_radius=8,
            scrollbar_button_color=COLOR_BORDER, scrollbar_button_hover_color=COLOR_SUBTEXT,
        )
        self.file_list_frame.pack(fill="both", expand=True)
        if _DND_AVAILABLE:
            self.drop_target_register(DND_FILES)
            self.dnd_bind("<<Drop>>", self._on_drop)

        self._divider(body)

        # ---------- ② 현장사진 추가(선택) ----------
        row2 = ctk.CTkFrame(body, fg_color=COLOR_BG)
        row2.pack(fill="x", pady=(10, 2))
        self._section_label(row2, "② 현장사진 추가 (선택)").pack(side="left")
        self.site_photo_count_label = self._hint_label(row2, "현장사진 0장")
        self.site_photo_count_label.pack(side="right")
        self._hint_label(body, "해당 아파트의 현재 현장사진이 있다면 추가해주세요. (JPG/JPEG/PNG/WEBP)").pack(
            fill="x", pady=(0, 4))
        site_btn_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        site_btn_row.pack(fill="x", pady=(0, 4))
        self._secondary_button(site_btn_row, "사진 선택", self._add_site_photos, width=100, height=28).pack(side="left")

        site_list_wrap = ctk.CTkFrame(body, fg_color=COLOR_BG, height=58)
        site_list_wrap.pack(fill="x", pady=(2, 10))
        site_list_wrap.pack_propagate(False)
        self.site_photo_list_frame = ctk.CTkScrollableFrame(
            site_list_wrap, fg_color=COLOR_BG, corner_radius=8,
            scrollbar_button_color=COLOR_BORDER, scrollbar_button_hover_color=COLOR_SUBTEXT,
        )
        self.site_photo_list_frame.pack(fill="both", expand=True)

        self._divider(body)

        # ---------- ③ 출력 폴더 ----------
        self._section_label(body, "③ 출력 폴더").pack(fill="x", pady=(10, 4))
        out_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        out_row.pack(fill="x", pady=(0, 10))
        self.out_entry = self._entry(out_row, height=32)
        self.out_entry.insert(0, self.output_dir)
        self.out_entry.pack(side="left", fill="x", expand=True)
        self._secondary_button(out_row, "찾아보기", self._choose_output, width=76, height=32).pack(
            side="left", padx=(6, 0))

        self._divider(body)

        # ---------- 진행 상태 ----------
        progress_wrap = ctk.CTkFrame(body, fg_color=COLOR_BG)
        progress_wrap.pack(fill="x", pady=(10, 2))
        self.progress_bar = ctk.CTkProgressBar(progress_wrap, height=6, corner_radius=3,
                                                 progress_color=COLOR_NAVY, fg_color=COLOR_HOVER)
        self.progress_bar.set(0)
        self.progress_bar.pack(fill="x")
        self.status_label = ctk.CTkLabel(progress_wrap, text="대기 중", font=_f(12),
                                           text_color=COLOR_SUBTEXT, anchor="w")
        self.status_label.pack(fill="x", pady=(4, 0))

        self.log_toggle_btn = ctk.CTkButton(
            body, text="▼ 상세 로그 보기", command=self._toggle_log, height=20,
            corner_radius=6, fg_color="transparent", hover_color=COLOR_HOVER,
            border_width=0, text_color=COLOR_SUBTEXT, font=_f(11), anchor="w",
        )
        self.log_toggle_btn.pack(fill="x", pady=(2, 0))

        self.log_box = ctk.CTkTextbox(body, height=90, corner_radius=8, border_width=1,
                                        border_color=COLOR_BORDER, font=_f(11))
        self.log_box.configure(state="disabled")
        # 기본 숨김 상태 (pack 하지 않음)

        # ---------- 완료 후 버튼 ----------
        self.post_frame = ctk.CTkFrame(body, fg_color=COLOR_BG)
        self.open_result_btn = self._secondary_button(self.post_frame, "결과 PPT 열기", self._open_result,
                                                          width=150, height=34)
        self.open_folder_btn = self._secondary_button(self.post_frame, "저장폴더 열기", self._open_folder,
                                                          width=150, height=34)
        self.open_result_btn.grid(row=0, column=0, padx=(0, 6), sticky="ew")
        self.open_folder_btn.grid(row=0, column=1, padx=(6, 0), sticky="ew")
        self.post_frame.grid_columnconfigure(0, weight=1)
        self.post_frame.grid_columnconfigure(1, weight=1)

        self._refresh_file_list()
        self._refresh_site_photo_list()

    def _open_knowledge_folder(self):
        self._open_path(self.knowledge_dir)

    # ------------------------------------------------------------------
    def _toggle_log(self):
        self._log_visible = not self._log_visible
        if self._log_visible:
            self.log_box.pack(fill="x", pady=(4, 0), after=self.log_toggle_btn)
            self.log_toggle_btn.configure(text="▲ 상세 로그 보기")
        else:
            self.log_box.pack_forget()
            self.log_toggle_btn.configure(text="▼ 상세 로그 보기")

    def _refresh_file_list(self):
        for w in self.file_list_frame.winfo_children():
            w.destroy()
        for path in self.selected_files:
            label = os.path.basename(path)  # 긴 경로 대신 파일명만 표시
            if is_legacy_ppt(path):
                label += "  (.ppt - 자동 변환)"
            self._file_row(self.file_list_frame, label, lambda p=path: self._remove_file(p))
        n = len(self.selected_files)
        self.file_count_label.configure(text=f"PPT {n}개 선택됨" if n else "")

    def _refresh_site_photo_list(self):
        for w in self.site_photo_list_frame.winfo_children():
            w.destroy()
        for path in self.site_photo_paths:
            self._file_row(self.site_photo_list_frame, os.path.basename(path),
                             lambda p=path: self._remove_site_photo(p))
        n = len(self.site_photo_paths)
        self.site_photo_count_label.configure(text=f"현장사진 {n}장 선택됨" if n else "현장사진 0장")

    def _register_selected_file(self, original_path: str):
        """선택된 파일을 화면 표시용 목록에 더하고, 즉시 프로그램 전용 작업폴더로
        안전하게 복사한다(외부 프로그램이 원본 임시파일을 나중에 지워버리는 경우에도
        안전하도록, "처리 버튼을 누른 뒤"가 아니라 "선택한 즉시" 복사한다)."""
        if original_path in self.selected_files or len(self.selected_files) >= MAX_FILES:
            return

        info = inspect_file(original_path)
        self.selection_logs.append(
            f"[선택] 원본경로={info['path']}, 확장자={info['ext']}, "
            f"exists={info['exists']}, size={info['size_bytes']:,} bytes"
        )
        if not info["exists"] or not info["is_file"]:
            messagebox.showerror("파일 오류", "선택한 PPT 파일을 찾을 수 없습니다. 다시 선택해주세요.")
            return
        if info["size_bytes"] == 0:
            messagebox.showerror("파일 오류", f"선택한 파일이 비어 있습니다: {os.path.basename(original_path)}")
            return

        # 선택 즉시 안전한 위치로 복사(처리 버튼을 누르기 전, 원본이 사라지기 전에)
        try:
            safe_dir = os.path.join(work_root(), "selected")
            os.makedirs(safe_dir, exist_ok=True)
            safe_name = f"{uuid.uuid4().hex[:8]}_{os.path.basename(original_path)}"
            work_path = os.path.join(safe_dir, safe_name)
            shutil.copy2(original_path, work_path)
        except Exception as e:
            messagebox.showerror("파일 오류", f"파일을 안전한 작업 폴더로 복사하지 못했습니다:\n{e}")
            return

        # 복사본 검증
        copy_ok = os.path.exists(work_path) and os.path.getsize(work_path) > 0
        zip_ok = True
        if copy_ok and work_path.lower().endswith(".pptx"):
            zip_ok = zipfile.is_zipfile(work_path)
        self.selection_logs.append(
            f"[선택] 작업 복사본={work_path}, 복사성공={copy_ok}, "
            f"pptx유효성(zipfile)={'해당없음(.ppt)' if not work_path.lower().endswith('.pptx') else zip_ok}"
        )
        if not copy_ok:
            messagebox.showerror("파일 오류", "파일 복사에 실패했습니다. 다시 선택해주세요.")
            return

        if is_legacy_ppt(original_path):
            messagebox.showinfo(
                "구형 PowerPoint(.ppt) 감지",
                f"'{os.path.basename(original_path)}' 파일은 구형 PowerPoint(.ppt) 형식입니다.\n"
                f"실행 시 LibreOffice로 자동 변환을 시도합니다. 변환이 불가능하면 오류로 안내됩니다.\n"
                f"(권장: PowerPoint에서 '.pptx'로 저장한 파일을 사용하면 더 안정적입니다)",
            )

        self.selected_files.append(original_path)
        self.selected_work_paths.append(work_path)

    def _add_files(self):
        paths = filedialog.askopenfilenames(title="기존 PPT 파일 선택",
                                             filetypes=[("PowerPoint files", "*.pptx *.ppt")])
        for p in paths:
            self._register_selected_file(p)
        self._refresh_file_list()

    def _on_drop(self, event):
        raw = self.tk.splitlist(event.data)
        ppt_added = False
        for p in raw:
            low = p.lower()
            if low.endswith((".pptx", ".ppt")):
                self._register_selected_file(p)
                ppt_added = True
            elif os.path.splitext(low)[1] in SITE_PHOTO_EXTS:
                self._register_site_photo(p)
        if ppt_added:
            self._refresh_file_list()
        self._refresh_site_photo_list()

    def _remove_file(self, path):
        if path in self.selected_files:
            idx = self.selected_files.index(path)
            del self.selected_files[idx]
            if idx < len(self.selected_work_paths):
                del self.selected_work_paths[idx]
        self._refresh_file_list()

    def _register_site_photo(self, original_path: str):
        """현장사진도 PPT 파일과 동일하게 선택 즉시 안전한 작업폴더로 복사한다.
        분류/OCR/익명화는 하지 않는다 - 사용자가 이미 아파트명/공종을 알고 고른
        "이 아파트"의 사진이므로 그대로 보여주기만 하면 된다."""
        if original_path in self.site_photo_paths or len(self.site_photo_paths) >= MAX_SITE_PHOTOS:
            return
        ext = os.path.splitext(original_path)[1].lower()
        if ext not in SITE_PHOTO_EXTS:
            messagebox.showerror("파일 오류", f"지원하지 않는 현장사진 형식입니다: {os.path.basename(original_path)}")
            return
        info = inspect_file(original_path)
        if not info["exists"] or not info["is_file"] or info["size_bytes"] == 0:
            messagebox.showerror("파일 오류", f"현장사진을 사용할 수 없습니다: {os.path.basename(original_path)}")
            return
        try:
            safe_dir = os.path.join(work_root(), "selected_site_photos")
            os.makedirs(safe_dir, exist_ok=True)
            work_path = os.path.join(safe_dir, f"{uuid.uuid4().hex[:8]}_{os.path.basename(original_path)}")
            shutil.copy2(original_path, work_path)
        except Exception as e:
            messagebox.showerror("파일 오류", f"현장사진을 안전한 작업 폴더로 복사하지 못했습니다:\n{e}")
            return
        if not (os.path.exists(work_path) and os.path.getsize(work_path) > 0):
            messagebox.showerror("파일 오류", "현장사진 복사에 실패했습니다. 다시 선택해주세요.")
            return
        self.selection_logs.append(
            f"[현장사진 선택] 원본={original_path}, 작업복사본={work_path}, size={info['size_bytes']:,} bytes"
        )
        self.site_photo_paths.append(original_path)
        self.site_photo_work_paths.append(work_path)

    def _add_site_photos(self):
        paths = filedialog.askopenfilenames(
            title="현장사진 선택",
            filetypes=[("이미지 파일", "*.jpg *.jpeg *.png *.webp")],
        )
        for p in paths:
            self._register_site_photo(p)
        self._refresh_site_photo_list()

    def _remove_site_photo(self, path):
        if path in self.site_photo_paths:
            idx = self.site_photo_paths.index(path)
            del self.site_photo_paths[idx]
            if idx < len(self.site_photo_work_paths):
                del self.site_photo_work_paths[idx]
        self._refresh_site_photo_list()

    def _choose_output(self):
        d = filedialog.askdirectory(title="결과물 저장 폴더 선택")
        if d:
            self.output_dir = d
            self.out_entry.delete(0, "end")
            self.out_entry.insert(0, d)

    # ------------------------------------------------------------------
    def _log(self, msg):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", msg + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _set_stage(self, stage):
        idx = STAGES.index(stage) if stage in STAGES else 0
        self.progress_bar.set((idx + 1) / len(STAGES))
        self.status_label.configure(text=stage)
        self._log(f"[진행] {stage}")

    def _on_run(self):
        apt = self.apt_entry.get().strip()
        work = self.work_var.get()
        out_dir = self.out_entry.get().strip() or self.output_dir
        if not out_dir:
            out_dir = default_output_dir()
            self.out_entry.delete(0, "end")
            self.out_entry.insert(0, out_dir)

        if not apt:
            messagebox.showwarning("입력 확인", "새 아파트명을 입력해주세요.")
            return
        if not (MIN_FILES <= len(self.selected_files) <= MAX_FILES):
            messagebox.showwarning("입력 확인", f"기존 PPT 파일을 {MIN_FILES}~{MAX_FILES}개 선택해주세요.")
            return

        # 파이프라인을 시작하기 전에 먼저 파일 존재/형식을 확인해서, 처리 도중
        # 알아보기 어려운 오류로 죽는 대신 즉시 명확한 안내를 준다.
        try:
            validate_input_paths(self.selected_work_paths)
        except FileNotFoundError:
            messagebox.showerror(
                "파일 오류",
                "선택한 PPT 파일의 작업 복사본을 찾을 수 없습니다. 파일을 다시 선택해주세요.",
            )
            return
        except ValueError as e:
            messagebox.showerror("파일 오류", str(e))
            return

        # 현장사진은 선택사항이지만, 선택된 경우 형식/존재 여부는 실행 전에 확인한다.
        if self.site_photo_work_paths:
            try:
                validate_site_photo_paths(self.site_photo_work_paths)
            except ValueError as e:
                messagebox.showerror("현장사진 오류", str(e))
                return

        self.run_btn.configure(state="disabled", text="생성 중...")
        self.post_frame.pack_forget()
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

        t = threading.Thread(target=self._run_worker, args=(apt, work, out_dir), daemon=True)
        t.start()

    def _run_worker(self, apt, work, out_dir):
        try:
            result = run_pipeline(apt, work, list(self.selected_work_paths), out_dir,
                                   progress_cb=lambda s: self.after(0, self._set_stage, s),
                                   extra_logs=list(self.selection_logs),
                                   site_photo_paths=list(self.site_photo_work_paths) or None)
            # 파이프라인이 "성공"을 반환했더라도, GUI 단에서 다시 한번 최종 PPT 파일이
            # 실제로 존재하는지 확인한다("정상 완료"로 잘못 표시하지 않기 위한 이중 확인).
            pptx_path = result.get("pptx")
            if not pptx_path or not os.path.exists(pptx_path) or os.path.getsize(pptx_path) == 0:
                self.after(0, self._on_ppt_failure,
                           f"파이프라인은 끝까지 실행됐지만 최종 PPT 파일을 찾을 수 없습니다.\n"
                           f"예상 경로: {pptx_path}\n"
                           f"처리 로그: {result.get('log')}")
                return
            self.result = result
            self.after(0, self._on_success, result)
        except Exception as e:
            traceback.print_exc()
            is_ppt_failure = type(e).__name__ == "PptGenerationFailedError"
            self.after(0, self._on_ppt_failure if is_ppt_failure else self._on_failure, str(e))

    def _on_success(self, result):
        self.run_btn.configure(state="normal", text="새 자료 만들기")
        self.post_frame.pack(fill="x", pady=(12, 0))
        self._log("\n=== 생성 완료 ===")
        self._log(f"PPTX: {result['pptx']}")
        if result.get("pdf"):
            self._log(f"PDF: {result['pdf']}")
        # "디자인 = 사람이 만든 템플릿, 콘텐츠 배치 = AI" 원칙이 실제로 얼마나
        # 지켜졌는지 사용자가 바로 확인할 수 있도록, 템플릿 엔진 사용 현황을 보여준다.
        stats = result.get("template_engine_stats")
        if stats:
            self._log(f"\n템플릿 엔진 사용: 전체 {stats['total_content_pages']}페이지 중 "
                       f"{stats['template_page_count']}페이지가 디자이너 제작 PowerPoint 템플릿을 사용했습니다 "
                       f"(사용률 {stats['template_usage_ratio']*100:.0f}%).")
            if stats.get("fallback_page_count"):
                self._log(f"  - 아직 전용 템플릿이 없는 {stats['fallback_page_count']}페이지는 "
                          "기존 자동 레이아웃으로 대체 생성되었습니다.")
        if result.get("warnings"):
            self._log("\n[확인이 필요한 항목]")
            for w in result["warnings"]:
                self._log(f" - {w}")
        messagebox.showinfo("완료", "새 자료 생성이 완료되었습니다.")

    def _on_failure(self, msg):
        self.run_btn.configure(state="normal", text="새 자료 만들기")
        self._log(f"\n[오류] {msg}")
        messagebox.showerror("오류", f"처리 중 오류가 발생했습니다:\n{msg}")

    def _on_ppt_failure(self, msg):
        """최종 PPT 파일이 생성되지 않은 경우 전용 처리. "완료"로 보이지 않도록
        상태 문구와 오류 대화상자 제목을 명확히 "PPT 생성 실패"로 표시한다."""
        self.run_btn.configure(state="normal", text="새 자료 만들기")
        self.status_label.configure(text="PPT 생성 실패")
        self._log(f"\n[PPT 생성 실패] {msg}")
        messagebox.showerror("PPT 생성 실패", f"최종 PPT 생성에 실패했습니다.\n\n{msg}")

    def _open_result(self):
        if self.result and self.result.get("pptx") and os.path.exists(self.result["pptx"]):
            self._open_path(self.result["pptx"])

    def _open_folder(self):
        if self.result and self.result.get("pptx"):
            self._open_path(os.path.dirname(self.result["pptx"]))

    @staticmethod
    def _open_path(path):
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)  # noqa
            elif sys.platform == "darwin":
                subprocess.run(["open", path])
            else:
                subprocess.run(["xdg-open", path])
        except Exception as e:
            messagebox.showerror("오류", f"파일을 열 수 없습니다: {e}")


def main():
    app = AutoMaterialApp()
    app.mainloop()


if __name__ == "__main__":
    main()
