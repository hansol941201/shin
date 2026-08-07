# -*- coding: utf-8 -*-
"""
자동화 자료취합 - 데스크톱 GUI (CustomTkinter 기반)
대기업 사내 업무도구 톤의 절제된 디자인: 흰 배경 + 짙은 남색 포인트, 작은 창, 얇은 테두리.
Windows 10/11에서 Python 없이도 동작하도록 PyInstaller로 패키징하는 것을 전제로 한다.
"""
import os
import subprocess
import sys
import threading
import traceback

import customtkinter as ctk
from tkinter import filedialog, messagebox

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.main import STAGES, run_pipeline
from app.utils.config import WORK_TYPES
from app.utils.input_validation import validate_input_paths

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    _DND_AVAILABLE = True
except Exception:
    _DND_AVAILABLE = False

ctk.set_appearance_mode("light")

# ------------------------------------------------------------------
# 절제된 디자인 토큰
# ------------------------------------------------------------------
FONT_FAMILY = "맑은 고딕"
COLOR_NAVY = "#12233F"
COLOR_NAVY_HOVER = "#1C355C"
COLOR_BORDER = "#D9DCE1"
COLOR_TEXT = "#1F2430"
COLOR_SUBTEXT = "#7A8090"
COLOR_BG = "#FFFFFF"
COLOR_FIELD_BG = "#FFFFFF"
COLOR_TRACK = "#EEF0F3"

MAX_FILES = 3
MIN_FILES = 2

WIN_W, WIN_H = 560, 650


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
        self.minsize(480, 560)

        self.selected_files = []
        self.output_dir = os.path.join(os.getcwd(), "output")
        self.result = None
        self._log_visible = False

        self._build_ui()

    def _center(self, w, h):
        self.update_idletasks()
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        x, y = (sw - w) // 2, (sh - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

    # ------------------------------------------------------------------
    def _section_label(self, parent, text):
        return ctk.CTkLabel(parent, text=text, font=_f(12), text_color=COLOR_SUBTEXT, anchor="w")

    def _entry(self, parent, placeholder="", height=36):
        return ctk.CTkEntry(
            parent, placeholder_text=placeholder, height=height, corner_radius=4,
            border_width=1, border_color=COLOR_BORDER, fg_color=COLOR_FIELD_BG,
            text_color=COLOR_TEXT, font=_f(13),
        )

    def _secondary_button(self, parent, text, command, width=80, height=30):
        return ctk.CTkButton(
            parent, text=text, command=command, width=width, height=height,
            corner_radius=4, fg_color="transparent", hover_color=COLOR_TRACK,
            border_width=1, border_color=COLOR_BORDER, text_color=COLOR_NAVY,
            font=_f(12),
        )

    def _build_ui(self):
        outer = ctk.CTkFrame(self, fg_color=COLOR_BG)
        outer.pack(fill="both", expand=True, padx=20, pady=16)

        # ---------- 상단: 제목 + 짧은 설명 ----------
        ctk.CTkLabel(outer, text="자동화 자료취합",
                     font=_f(19, "bold"), text_color=COLOR_TEXT, anchor="w").pack(fill="x")
        ctk.CTkLabel(outer, text="기존 PPT 2~3개의 사진과 문구를 분석하여 새로운 자료로 재구성합니다.",
                     font=_f(11), text_color=COLOR_SUBTEXT, anchor="w").pack(fill="x", pady=(2, 14))

        # ---------- 새 아파트명 / 공종 ----------
        self._section_label(outer, "새 아파트명").pack(fill="x")
        self.apt_entry = self._entry(outer, "예) 은하수아파트")
        self.apt_entry.pack(fill="x", pady=(4, 10))

        self._section_label(outer, "공종").pack(fill="x")
        self.work_var = ctk.StringVar(value=WORK_TYPES[0])
        self.work_menu = ctk.CTkOptionMenu(
            outer, values=WORK_TYPES, variable=self.work_var, height=36, corner_radius=4,
            fg_color=COLOR_FIELD_BG, button_color=COLOR_FIELD_BG, button_hover_color=COLOR_TRACK,
            text_color=COLOR_TEXT, dropdown_fg_color=COLOR_BG, dropdown_text_color=COLOR_TEXT,
            dropdown_hover_color=COLOR_TRACK, font=_f(13), dropdown_font=_f(12),
        )
        self.work_menu.pack(fill="x", pady=(4, 14))

        # ---------- PPT 파일 영역 ----------
        self._section_label(outer, f"기존 PPT 파일 ({MIN_FILES}~{MAX_FILES}개)").pack(fill="x")

        self.drop_area = ctk.CTkFrame(
            outer, height=64, corner_radius=6, fg_color=COLOR_BG,
            border_width=1, border_color=COLOR_BORDER,
        )
        self.drop_area.pack(fill="x", pady=(4, 4))
        self.drop_area.pack_propagate(False)
        dnd_hint = "PPT 파일 2~3개를 끌어놓거나 파일을 선택하세요."
        self.drop_hint = ctk.CTkLabel(self.drop_area, text=dnd_hint, font=_f(11),
                                        text_color=COLOR_SUBTEXT)
        self.drop_hint.place(relx=0.5, rely=0.38, anchor="center")
        self._select_btn = self._secondary_button(self.drop_area, "파일 선택", self._add_files, width=84, height=26)
        self._select_btn.place(relx=0.5, rely=0.75, anchor="center")
        if _DND_AVAILABLE:
            self.drop_area.drop_target_register(DND_FILES)
            self.drop_area.dnd_bind("<<Drop>>", self._on_drop)

        self.file_list_frame = ctk.CTkFrame(outer, fg_color=COLOR_BG)
        self.file_list_frame.pack(fill="x", pady=(4, 14))

        # ---------- 출력 폴더 ----------
        self._section_label(outer, "출력 폴더").pack(fill="x")
        out_row = ctk.CTkFrame(outer, fg_color=COLOR_BG)
        out_row.pack(fill="x", pady=(4, 16))
        self.out_entry = self._entry(out_row, height=34)
        self.out_entry.insert(0, self.output_dir)
        self.out_entry.pack(side="left", fill="x", expand=True)
        self._secondary_button(out_row, "찾아보기", self._choose_output, width=76, height=34).pack(
            side="left", padx=(6, 0))

        # ---------- 진행 상태 ----------
        self.progress_bar = ctk.CTkProgressBar(outer, height=7, corner_radius=3,
                                                 progress_color=COLOR_NAVY, fg_color=COLOR_TRACK)
        self.progress_bar.set(0)
        self.progress_bar.pack(fill="x", pady=(0, 4))
        self.status_label = ctk.CTkLabel(outer, text="대기 중", font=_f(11), text_color=COLOR_SUBTEXT, anchor="w")
        self.status_label.pack(fill="x")

        self.log_toggle_btn = ctk.CTkButton(
            outer, text="상세 로그 보기 ▾", command=self._toggle_log, width=120, height=22,
            corner_radius=4, fg_color="transparent", hover_color=COLOR_TRACK,
            border_width=0, text_color=COLOR_SUBTEXT, font=_f(11), anchor="w",
        )
        self.log_toggle_btn.pack(fill="x", pady=(2, 0))

        self.log_box = ctk.CTkTextbox(outer, height=140, corner_radius=4, border_width=1,
                                        border_color=COLOR_BORDER, font=_f(11))
        self.log_box.configure(state="disabled")
        # 기본 숨김 상태 (pack 하지 않음)

        # ---------- 완료 후 버튼 ----------
        self.post_frame = ctk.CTkFrame(outer, fg_color=COLOR_BG)
        post_row1 = ctk.CTkFrame(self.post_frame, fg_color=COLOR_BG)
        post_row1.pack(fill="x", pady=(0, 4))
        post_row2 = ctk.CTkFrame(self.post_frame, fg_color=COLOR_BG)
        post_row2.pack(fill="x")
        self.open_result_btn = self._secondary_button(post_row1, "결과 PPT 열기", self._open_result, width=120, height=32)
        self.open_preview_btn = self._secondary_button(post_row1, "전체 미리보기 열기", self._open_preview, width=140, height=32)
        self.open_validation_btn = self._secondary_button(post_row2, "검수 결과 열기", self._open_validation, width=120, height=32)
        self.open_folder_btn = self._secondary_button(post_row2, "저장 폴더 열기", self._open_folder, width=120, height=32)
        self.retry_btn = self._secondary_button(post_row2, "다시 만들기", self._reset, width=100, height=32)
        self.open_result_btn.pack(side="left", padx=(0, 6))
        self.open_preview_btn.pack(side="left")
        self.open_validation_btn.pack(side="left", padx=(0, 6))
        self.open_folder_btn.pack(side="left", padx=(0, 6))
        self.retry_btn.pack(side="left")

        # ---------- 하단: 실행 버튼 ----------
        bottom = ctk.CTkFrame(outer, fg_color=COLOR_BG)
        bottom.pack(fill="x", side="bottom", pady=(12, 0))
        self.run_btn = ctk.CTkButton(
            bottom, text="새 자료 만들기", height=42, width=180, corner_radius=6,
            fg_color=COLOR_NAVY, hover_color=COLOR_NAVY_HOVER, text_color="white",
            font=_f(13, "bold"), command=self._on_run,
        )
        self.run_btn.pack(side="right")

        self._refresh_file_list()

    # ------------------------------------------------------------------
    def _toggle_log(self):
        self._log_visible = not self._log_visible
        if self._log_visible:
            self.log_box.pack(fill="both", expand=True, pady=(4, 0), before=self.post_frame if self.post_frame.winfo_ismapped() else None)
            self.log_toggle_btn.configure(text="상세 로그 보기 ▴")
        else:
            self.log_box.pack_forget()
            self.log_toggle_btn.configure(text="상세 로그 보기 ▾")

    def _refresh_file_list(self):
        for w in self.file_list_frame.winfo_children():
            w.destroy()
        for path in self.selected_files:
            row = ctk.CTkFrame(self.file_list_frame, height=32, corner_radius=4,
                                 fg_color=COLOR_BG, border_width=1, border_color=COLOR_BORDER)
            row.pack(fill="x", pady=2)
            row.pack_propagate(False)
            ctk.CTkLabel(row, text=os.path.basename(path), font=_f(12), text_color=COLOR_TEXT,
                          anchor="w").pack(side="left", fill="x", expand=True, padx=(8, 0))
            ctk.CTkButton(row, text="✕", width=24, height=22, corner_radius=3,
                           fg_color="transparent", hover_color=COLOR_TRACK, text_color=COLOR_SUBTEXT,
                           font=_f(11), command=lambda p=path: self._remove_file(p)).pack(side="right", padx=6)
        # 파일 목록이 많아져도(최대 3개) 창 자체는 커지지 않도록 높이를 고정하지 않고 콘텐츠만큼만 사용

    def _add_files(self):
        paths = filedialog.askopenfilenames(title="기존 PPT 파일 선택",
                                             filetypes=[("PowerPoint files", "*.pptx *.ppt")])
        for p in paths:
            if p not in self.selected_files and len(self.selected_files) < MAX_FILES:
                self.selected_files.append(p)
        self._refresh_file_list()

    def _on_drop(self, event):
        raw = self.tk.splitlist(event.data)
        for p in raw:
            if p.lower().endswith((".pptx", ".ppt")) and p not in self.selected_files:
                if len(self.selected_files) < MAX_FILES:
                    self.selected_files.append(p)
        self._refresh_file_list()

    def _remove_file(self, path):
        self.selected_files = [p for p in self.selected_files if p != path]
        self._refresh_file_list()

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

        if not apt:
            messagebox.showwarning("입력 확인", "새 아파트명을 입력해주세요.")
            return
        if not (MIN_FILES <= len(self.selected_files) <= MAX_FILES):
            messagebox.showwarning("입력 확인", f"기존 PPT 파일을 {MIN_FILES}~{MAX_FILES}개 선택해주세요.")
            return

        # 파이프라인을 시작하기 전에 먼저 파일 존재/형식을 확인해서, 처리 도중
        # 알아보기 어려운 오류로 죽는 대신 즉시 명확한 안내를 준다.
        try:
            validate_input_paths(self.selected_files)
        except FileNotFoundError:
            messagebox.showerror("파일 오류", "선택한 PPT 파일을 찾을 수 없습니다. 다시 선택해주세요.")
            return
        except ValueError as e:
            messagebox.showerror("파일 오류", str(e))
            return

        self.run_btn.configure(state="disabled", text="처리 중...")
        self.post_frame.pack_forget()
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

        t = threading.Thread(target=self._run_worker, args=(apt, work, out_dir), daemon=True)
        t.start()

    def _run_worker(self, apt, work, out_dir):
        try:
            result = run_pipeline(apt, work, list(self.selected_files), out_dir,
                                   progress_cb=lambda s: self.after(0, self._set_stage, s))
            self.result = result
            self.after(0, self._on_success, result)
        except Exception as e:
            traceback.print_exc()
            self.after(0, self._on_failure, str(e))

    def _on_success(self, result):
        self.run_btn.configure(state="normal", text="새 자료 만들기")
        self.post_frame.pack(fill="x", pady=(8, 0))
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

    def _open_preview(self):
        path = self.result.get("preview_png") if self.result else None
        if path and os.path.exists(path):
            self._open_path(path)
        else:
            messagebox.showinfo("안내", "전체 미리보기 이미지가 생성되지 않았습니다"
                                          "(LibreOffice 미설치 시 생략됩니다).")

    def _open_validation(self):
        path = self.result.get("validation_report") if self.result else None
        if path and os.path.exists(path):
            self._open_path(path)

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

    def _reset(self):
        self.selected_files = []
        self._refresh_file_list()
        self.apt_entry.delete(0, "end")
        self.progress_bar.set(0)
        self.status_label.configure(text="대기 중")
        self.post_frame.pack_forget()


def main():
    app = AutoMaterialApp()
    app.mainloop()


if __name__ == "__main__":
    main()
