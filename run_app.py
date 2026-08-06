# -*- coding: utf-8 -*-
"""EXE/데스크톱 실행 진입점. PyInstaller가 이 파일을 빌드 대상으로 사용한다.
--noconsole로 빌드되어 콘솔 창이 없으므로, 실행 중 예외가 발생하면 콘솔이 즉시
닫히는 대신 오류 로그 파일을 남기고 오류 대화상자를 띄운다.
"""
import datetime
import os
import sys
import traceback


def _base_dir() -> str:
    """EXE로 패키징된 경우와 스크립트로 실행된 경우 모두에서 실행 파일 위치를 반환한다."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _write_crash_log(exc: BaseException) -> str:
    base = _base_dir()
    logs_dir = os.path.join(base, "logs")
    os.makedirs(logs_dir, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ts_file = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(logs_dir, f"오류로그_{ts_file}.txt")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(f"===== {ts} 오류 발생 =====\n")
        f.write(f"Python: {sys.version}\n")
        f.write(f"실행 위치: {base}\n\n")
        f.write("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
    return log_path


def main():
    sys.path.insert(0, _base_dir())
    try:
        from app.ui.gui import main as gui_main
        gui_main()
    except Exception as e:  # noqa: BLE001 - 최상위 예외를 사용자에게 알리기 위해 광범위하게 처리
        hint = ""
        if isinstance(e, ModuleNotFoundError) and "tkinter" in str(e):
            hint = (
                "\n\n[안내] Python에 tkinter가 포함되어 있지 않습니다. "
                "python.org에서 받은 표준 설치파일로 Python을 다시 설치하면 "
                "기본 옵션에 tkinter가 포함됩니다."
            )
        log_path = _write_crash_log(e)
        print(f"[오류] {e}{hint}\n로그 파일: {log_path}", file=sys.stderr)
        try:
            import tkinter as tk
            from tkinter import messagebox
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror(
                "자동화 자료취합 - 오류",
                f"프로그램 실행 중 오류가 발생했습니다.\n\n{e}{hint}\n\n"
                f"자세한 내용은 다음 파일에 저장되었습니다:\n{log_path}",
            )
        except Exception:
            # tkinter 자체가 실패한 경우에도 최소한 로그 파일과 콘솔 출력은 남긴다.
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
