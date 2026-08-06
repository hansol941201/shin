# -*- coding: utf-8 -*-
"""
입주민 설명자료 자동 제작 - 데스크톱 GUI (CustomTkinter 기반)
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

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    _DND_AVAILABLE = True
except Exception:
    _DND_AVAILABLE = False

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")

MAX_FILES = 3
MIN_FILES = 2


class ResidentPPTApp(ctk.CTk if not _DND_AVAILABLE else TkinterDnD.Tk):
    def __init__(self):
        super().__init__()
        self.title("입주민 설명자료 자동 제작")
        self.geometry("720x760")
        self.minsize(680, 700)
        self.selected_files = []
        self.output_dir = os.path.join(os.getcwd(), "output")
        self.result = None

        self._build_ui()

    # ------------------------------------------------------------------
    def _build_ui(self):
        pad = {"padx": 20, "pady": 8}

        title = ctk.CTkLabel(self, text="입주민 설명자료 자동 제작",
                              font=ctk.CTkFont(size=22, weight="bold"))
        title.pack(anchor="w", **pad)

        # 아파트명
        frm1 = ctk.CTkFrame(self, fg_color="transparent")
        frm1.pack(fill="x", **pad)
        ctk.CTkLabel(frm1, text="새 아파트명", width=110, anchor="w").pack(side="left")
        self.apt_entry = ctk.CTkEntry(frm1, placeholder_text="예) 은하수아파트")
        self.apt_entry.pack(side="left", fill="x", expand=True)

        # 공종 선택
        frm2 = ctk.CTkFrame(self, fg_color="transparent")
        frm2.pack(fill="x", **pad)
        ctk.CTkLabel(frm2, text="공종 선택", width=110, anchor="w").pack(side="left")
        self.work_var = ctk.StringVar(value=WORK_TYPES[0])
        self.work_menu = ctk.CTkOptionMenu(frm2, values=WORK_TYPES, variable=self.work_var)
        self.work_menu.pack(side="left", fill="x", expand=True)

        # 파일 선택 영역
        ctk.CTkLabel(self, text=f"기존 PPT 파일 ({MIN_FILES}~{MAX_FILES}개, 같은 공종)",
                     anchor="w").pack(fill="x", padx=20)
        self.file_box = ctk.CTkScrollableFrame(self, height=140)
        self.file_box.pack(fill="x", padx=20, pady=(4, 4))
        if _DND_AVAILABLE:
            self.file_box.drop_target_register(DND_FILES)
            self.file_box.dnd_bind("<<Drop>>", self._on_drop)

        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.pack(fill="x", padx=20)
        ctk.CTkButton(btn_frame, text="+ 파일 추가", command=self._add_files, width=120).pack(side="left")
        dnd_note = "(드래그 앤 드롭 가능)" if _DND_AVAILABLE else "(드래그 앤 드롭 모듈 미설치 - 버튼으로 추가)"
        ctk.CTkLabel(btn_frame, text=dnd_note, text_color="gray").pack(side="left", padx=10)

        # 출력 폴더
        frm3 = ctk.CTkFrame(self, fg_color="transparent")
        frm3.pack(fill="x", **pad)
        ctk.CTkLabel(frm3, text="출력 폴더", width=110, anchor="w").pack(side="left")
        self.out_entry = ctk.CTkEntry(frm3)
        self.out_entry.insert(0, self.output_dir)
        self.out_entry.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(frm3, text="찾아보기", width=90, command=self._choose_output).pack(side="left", padx=(6, 0))

        # 실행 버튼
        self.run_btn = ctk.CTkButton(self, text="새 설명자료 만들기", height=42,
                                      font=ctk.CTkFont(size=15, weight="bold"),
                                      command=self._on_run)
        self.run_btn.pack(fill="x", padx=20, pady=(12, 6))

        # 진행 상태
        self.progress_bar = ctk.CTkProgressBar(self)
        self.progress_bar.set(0)
        self.progress_bar.pack(fill="x", padx=20, pady=(4, 2))
        self.status_label = ctk.CTkLabel(self, text="대기 중", anchor="w")
        self.status_label.pack(fill="x", padx=20)

        self.log_box = ctk.CTkTextbox(self, height=180)
        self.log_box.pack(fill="both", expand=True, padx=20, pady=10)
        self.log_box.configure(state="disabled")

        # 완료 후 버튼 영역
        self.post_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.post_frame.pack(fill="x", padx=20, pady=(0, 16))
        self.open_result_btn = ctk.CTkButton(self.post_frame, text="결과 파일 열기",
                                              command=self._open_result, state="disabled")
        self.open_result_btn.pack(side="left", expand=True, fill="x", padx=4)
        self.open_folder_btn = ctk.CTkButton(self.post_frame, text="저장 폴더 열기",
                                              command=self._open_folder, state="disabled")
        self.open_folder_btn.pack(side="left", expand=True, fill="x", padx=4)
        self.retry_btn = ctk.CTkButton(self.post_frame, text="다시 만들기",
                                        command=self._reset, state="disabled")
        self.retry_btn.pack(side="left", expand=True, fill="x", padx=4)

    # ------------------------------------------------------------------
    def _refresh_file_list(self):
        for w in self.file_box.winfo_children():
            w.destroy()
        for path in self.selected_files:
            row = ctk.CTkFrame(self.file_box, fg_color="transparent")
            row.pack(fill="x", pady=2)
            ctk.CTkLabel(row, text=os.path.basename(path), anchor="w").pack(side="left", fill="x", expand=True)
            ctk.CTkButton(row, text="삭제", width=50,
                          command=lambda p=path: self._remove_file(p)).pack(side="right")

    def _add_files(self):
        paths = filedialog.askopenfilenames(title="기존 PPT 파일 선택",
                                             filetypes=[("PowerPoint files", "*.pptx *.ppt")])
        for p in paths:
            if p not in self.selected_files and len(self.selected_files) < MAX_FILES:
                self.selected_files.append(p)
        if len(paths) and len(self.selected_files) >= MAX_FILES:
            pass
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

        self.run_btn.configure(state="disabled", text="처리 중...")
        self.open_result_btn.configure(state="disabled")
        self.open_folder_btn.configure(state="disabled")
        self.retry_btn.configure(state="disabled")
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
        self.run_btn.configure(state="normal", text="새 설명자료 만들기")
        self.open_result_btn.configure(state="normal")
        self.open_folder_btn.configure(state="normal")
        self.retry_btn.configure(state="normal")
        self._log("\n=== 생성 완료 ===")
        self._log(f"PPTX: {result['pptx']}")
        if result.get("pdf"):
            self._log(f"PDF: {result['pdf']}")
        if result.get("warnings"):
            self._log("\n[확인이 필요한 항목]")
            for w in result["warnings"]:
                self._log(f" - {w}")
        messagebox.showinfo("완료", "새 설명자료 생성이 완료되었습니다.")

    def _on_failure(self, msg):
        self.run_btn.configure(state="normal", text="새 설명자료 만들기")
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

    def _reset(self):
        self.selected_files = []
        self._refresh_file_list()
        self.apt_entry.delete(0, "end")
        self.progress_bar.set(0)
        self.status_label.configure(text="대기 중")
        self.open_result_btn.configure(state="disabled")
        self.open_folder_btn.configure(state="disabled")
        self.retry_btn.configure(state="disabled")


def main():
    app = ResidentPPTApp()
    app.mainloop()


if __name__ == "__main__":
    main()
