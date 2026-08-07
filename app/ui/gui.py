# -*- coding: utf-8 -*-
"""
자동화 자료취합 - 데스크톱 GUI (CustomTkinter 기반)

[재설계 - 2026-08] "Windows 11 기본 프로그램"처럼 단순하고 깔끔하게 보이는 것이
목표다. 개발툴처럼 보이면 안 된다: 회색 박스/불필요한 테두리를 걷어내고, 여백을
넉넉히 주고, 파일 목록은 파일명만 짧게 보여주며, 하단의 "새 자료 만들기" 버튼은
창 크기와 무관하게 항상 화면 안에 고정된다(중간 콘텐츠만 스크롤).
Windows 10/11에서 Python 없이도 동작하도록 PyInstaller로 패키징하는 것을 전제로 한다.
"""
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
from app.main import STAGES, run_pipeline
from app.utils.config import WORK_TYPES
from app.utils.input_validation import inspect_file, is_legacy_ppt, validate_input_paths
from app.utils.paths import default_output_dir, work_root
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

MAX_FILES = 3
MIN_FILES = 2
MAX_SITE_PHOTOS = 10

WIN_W, WIN_H = 520, 620


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

        self.selected_files = []       # 화면 표시용: 사용자가 실제로 선택한 원본 경로
        self.selected_work_paths = []  # 실제 처리용: 선택 즉시 안전한 작업폴더로 복사한 경로
        self.selection_logs = []       # 선택 시점 경로추적 로그(실행 시 처리로그에 포함됨)
        self.site_photo_paths = []       # 화면 표시용: 현장사진 원본 경로(선택사항)
        self.site_photo_work_paths = []  # 실제 처리용: 현장사진 안전 복사본 경로
        self.output_dir = default_output_dir()
        self.result = None
        self._log_visible = False
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

    def _build_ui(self):
        # ---------- 하단 고정: 실행 버튼(창 크기와 무관하게 항상 화면 안에 고정) ----------
        bottom = ctk.CTkFrame(self, fg_color=COLOR_BG)
        bottom.pack(fill="x", side="bottom", padx=20, pady=16)
        self.run_btn = ctk.CTkButton(
            bottom, text="새 자료 만들기", height=44, corner_radius=10,
            fg_color=COLOR_NAVY, hover_color=COLOR_NAVY_HOVER, text_color="white",
            font=_f(14, "bold"), command=self._on_run,
        )
        self.run_btn.pack(fill="x")

        # ---------- 중간: 스크롤 가능한 본문(내용이 많아져도 하단 버튼을 밀어내지 않음) ----------
        body = ctk.CTkScrollableFrame(self, fg_color=COLOR_BG, scrollbar_button_color=COLOR_BORDER,
                                        scrollbar_button_hover_color=COLOR_SUBTEXT)
        body.pack(fill="both", expand=True, padx=20, pady=(16, 0))

        # ---------- 제목 + 부제 + 빌드 버전 ----------
        title_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        title_row.pack(fill="x")
        ctk.CTkLabel(title_row, text="자동화 자료취합",
                     font=_f(20, "bold"), text_color=COLOR_TEXT, anchor="w").pack(side="left")
        ctk.CTkLabel(title_row, text=f"v.{self.build_commit}", font=_f(10),
                     text_color=COLOR_SUBTEXT, anchor="e").pack(side="right", pady=(8, 0))
        self._hint_label(body, "기존 PPT 2~3개를 분석하여 새로운 입주민 설명자료를 자동 생성합니다.").pack(
            fill="x", pady=(2, 20))

        # ---------- 새 아파트명 ----------
        self._section_label(body, "새 아파트명").pack(fill="x")
        self.apt_entry = self._entry(body, "예) 은하수아파트")
        self.apt_entry.pack(fill="x", pady=(6, 16))

        # ---------- 공종 ----------
        self._section_label(body, "공종").pack(fill="x")
        self.work_var = ctk.StringVar(value=WORK_TYPES[0])
        self.work_menu = ctk.CTkOptionMenu(
            body, values=WORK_TYPES, variable=self.work_var, height=36, corner_radius=8,
            fg_color=COLOR_BG, button_color=COLOR_BG, button_hover_color=COLOR_HOVER,
            text_color=COLOR_TEXT, dropdown_fg_color=COLOR_BG, dropdown_text_color=COLOR_TEXT,
            dropdown_hover_color=COLOR_HOVER, font=_f(13), dropdown_font=_f(12),
        )
        self.work_menu.pack(fill="x", pady=(6, 20))

        self._divider(body)

        # ---------- ① 기존 PPT 추가 ----------
        row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        row.pack(fill="x", pady=(16, 2))
        self._section_label(row, "① 기존 PPT 추가 (2~3개)").pack(side="left")
        self.file_count_label = self._hint_label(row, "")
        self.file_count_label.pack(side="right")
        ppt_btn_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        ppt_btn_row.pack(fill="x", pady=(4, 4))
        self._secondary_button(ppt_btn_row, "파일 선택", self._add_files, width=100, height=30).pack(side="left")
        if _DND_AVAILABLE:
            self._hint_label(ppt_btn_row, "  또는 파일을 창에 끌어놓으세요").pack(side="left")

        self.file_list_frame = ctk.CTkScrollableFrame(
            body, fg_color=COLOR_BG, height=96, corner_radius=8,
            scrollbar_button_color=COLOR_BORDER, scrollbar_button_hover_color=COLOR_SUBTEXT,
        )
        self.file_list_frame.pack(fill="x", pady=(4, 20))
        if _DND_AVAILABLE:
            self.drop_target_register(DND_FILES)
            self.dnd_bind("<<Drop>>", self._on_drop)

        self._divider(body)

        # ---------- ② 현장사진 추가(선택) ----------
        row2 = ctk.CTkFrame(body, fg_color=COLOR_BG)
        row2.pack(fill="x", pady=(16, 2))
        self._section_label(row2, "② 현장사진 추가 (선택)").pack(side="left")
        self.site_photo_count_label = self._hint_label(row2, "")
        self.site_photo_count_label.pack(side="right")
        self._hint_label(body, "해당 아파트의 현재 현장사진 (JPG / PNG / WEBP, 최대 10장)").pack(fill="x", pady=(0, 4))
        site_btn_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        site_btn_row.pack(fill="x", pady=(0, 4))
        self._secondary_button(site_btn_row, "사진 선택", self._add_site_photos, width=100, height=30).pack(side="left")

        self.site_photo_list_frame = ctk.CTkScrollableFrame(
            body, fg_color=COLOR_BG, height=96, corner_radius=8,
            scrollbar_button_color=COLOR_BORDER, scrollbar_button_hover_color=COLOR_SUBTEXT,
        )
        self.site_photo_list_frame.pack(fill="x", pady=(4, 20))

        self._divider(body)

        # ---------- ③ 출력 폴더 ----------
        self._section_label(body, "③ 출력 폴더").pack(fill="x", pady=(16, 6))
        out_row = ctk.CTkFrame(body, fg_color=COLOR_BG)
        out_row.pack(fill="x", pady=(0, 20))
        self.out_entry = self._entry(out_row, height=34)
        self.out_entry.insert(0, self.output_dir)
        self.out_entry.pack(side="left", fill="x", expand=True)
        self._secondary_button(out_row, "찾아보기", self._choose_output, width=80, height=34).pack(
            side="left", padx=(6, 0))

        self._divider(body)

        # ---------- 진행 상태 ----------
        progress_wrap = ctk.CTkFrame(body, fg_color=COLOR_BG)
        progress_wrap.pack(fill="x", pady=(16, 4))
        self.progress_bar = ctk.CTkProgressBar(progress_wrap, height=6, corner_radius=3,
                                                 progress_color=COLOR_NAVY, fg_color=COLOR_HOVER)
        self.progress_bar.set(0)
        self.progress_bar.pack(fill="x")
        self.status_label = ctk.CTkLabel(progress_wrap, text="대기 중", font=_f(12),
                                           text_color=COLOR_SUBTEXT, anchor="w")
        self.status_label.pack(fill="x", pady=(6, 0))

        self.log_toggle_btn = ctk.CTkButton(
            body, text="▼ 상세 로그 보기", command=self._toggle_log, height=22,
            corner_radius=6, fg_color="transparent", hover_color=COLOR_HOVER,
            border_width=0, text_color=COLOR_SUBTEXT, font=_f(11), anchor="w",
        )
        self.log_toggle_btn.pack(fill="x", pady=(4, 0))

        self.log_box = ctk.CTkTextbox(body, height=130, corner_radius=8, border_width=1,
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

    def _divider(self, parent):
        ctk.CTkFrame(parent, height=1, fg_color=COLOR_BORDER).pack(fill="x")

    # ------------------------------------------------------------------
    def _toggle_log(self):
        self._log_visible = not self._log_visible
        if self._log_visible:
            self.log_box.pack(fill="x", pady=(4, 0), after=self.log_toggle_btn)
            self.log_toggle_btn.configure(text="▲ 상세 로그 보기")
        else:
            self.log_box.pack_forget()
            self.log_toggle_btn.configure(text="▼ 상세 로그 보기")

    def _file_row(self, parent, label, on_remove):
        row = ctk.CTkFrame(parent, fg_color=COLOR_BG, height=28)
        row.pack(fill="x", pady=1)
        row.pack_propagate(False)
        ctk.CTkLabel(row, text=label, font=_f(12), text_color=COLOR_TEXT,
                      anchor="w").pack(side="left", fill="x", expand=True)
        ctk.CTkButton(row, text="✕", width=22, height=22, corner_radius=6,
                       fg_color="transparent", hover_color=COLOR_HOVER, text_color=COLOR_SUBTEXT,
                       font=_f(11), command=on_remove).pack(side="right")

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
        self.site_photo_count_label.configure(text=f"현장사진 {n}장 선택됨" if n else "")

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
            self.result = result
            self.after(0, self._on_success, result)
        except Exception as e:
            traceback.print_exc()
            self.after(0, self._on_failure, str(e))

    def _on_success(self, result):
        self.run_btn.configure(state="normal", text="새 자료 만들기")
        self.post_frame.pack(fill="x", pady=(12, 0))
        self._log("\n=== 생성 완료 ===")
        self._log(f"PPTX: {result['pptx']}")
        if result.get("pdf"):
            self._log(f"PDF: {result['pdf']}")
        if result.get("warnings"):
            self._log("\n[확인이 필요한 항목]")
            for w in result["warnings"]:
                self._log(f" - {w}")
        messagebox.showinfo("완료", "새 자료 생성이 완료되었습니다.")

    def _on_failure(self, msg):
        self.run_btn.configure(state="normal", text="새 자료 만들기")
        self._log(f"\n[오류] {msg}")
        messagebox.showerror("오류", f"처리 중 오류가 발생했습니다:\n{msg}")

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
