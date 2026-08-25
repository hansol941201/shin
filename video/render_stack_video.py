#!/usr/bin/env python3
"""
POUR 견적 문서 5장이 화면 위에서 한 장씩 내려와 차곡차곡 쌓이는
7초 분량의 기업 홍보용 MP4(1920x1080 / 30fps / H.264)를 생성한다.

- 자막/제목/로고 없음, 오디오 없음
- 원본 이미지의 비율과 내용은 그대로 유지 (크기만 균일 축소)
"""

import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

import imageio_ffmpeg

# ---------------------------------------------------------------- 기본 설정
HERE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(HERE, "images")
OUT_DIR = os.path.join(HERE, "output")
OUT_PATH = os.path.join(OUT_DIR, "pour_document_stack_1080p.mp4")

W, H = 1920, 1080
FPS = 30
DURATION = 7.0
N_FRAMES = int(round(DURATION * FPS))          # 210

FILES = [
    "02_안내사항.png",
    "03_원가계산서.png",
    "04_집계표.png",
    "06_산출내역서.png",
    "07_물량산출내역서.png",
]

# 타임라인(초)
T_FIRST = 0.25      # 첫 장이 내려오기 시작하는 시각(그 전은 빈 배경)
STAGGER = 1.05      # 장 사이 간격
DROP = 1.00         # 한 장이 내려와 안착하기까지 걸리는 시간
# -> 마지막 장 안착 = 0.25 + 4*1.05 + 1.00 = 5.45s, 이후 1.55s 정지 화면

# 카메라(전체 화면) 확대: 1.00 -> 1.05, 후반부로 갈수록 조금 더 밀어 넣는다
ZOOM_END = 1.05
ZOOM_SHAPE = 2.2

PAPER_W = 1080.0    # 카메라 배율 1.0 기준 종이 가로 폭(px)

# 장별 안착 위치/각도. 실제 서류 더미처럼 조금씩 어긋나게 배치한다.
#   dx, dy      : 화면 중앙 기준 안착 오프셋(px)
#   angle       : 안착 회전각(도)
#   lift        : 아래 종이 위에 얹히면서 카메라에 살짝 가까워지는 배율
#   drift       : 내려오기 시작할 때의 좌우 오프셋(px)
#   d_angle     : 내려오는 동안 풀리는 회전량(도, 1~3도)
LAYOUT = [
    dict(dx=-24, dy= 16, angle=-2.4, lift=1.000, drift= 78, d_angle= 2.1),
    dict(dx= 28, dy=  4, angle= 1.8, lift=1.007, drift=-86, d_angle=-1.9),
    dict(dx=-13, dy=-11, angle= 2.5, lift=1.014, drift= 66, d_angle= 2.2),
    dict(dx= 17, dy=-20, angle=-1.5, lift=1.021, drift=-72, d_angle=-1.7),
    dict(dx= -5, dy=  3, angle= 1.0, lift=1.028, drift= 58, d_angle= 1.4),
]

Y_START = -600.0    # 화면 밖(위쪽)에서 출발


# ---------------------------------------------------------------- 이징
def ease_out_cubic(p):
    return 1.0 - (1.0 - p) ** 3


def ease_land(p):
    """내려올 때는 부드럽게 감속, 닿은 뒤 아주 미세하게 두 번 튄다.
    반환값 1.0 = 안착면, 1.0 미만 = 아직 안착면보다 위."""
    t0 = 0.74
    if p <= t0:
        return ease_out_cubic(p / t0)
    s = (p - t0) / (1.0 - t0)
    return 1.0 - 0.045 * math.exp(-5.0 * s) * abs(math.sin(2.0 * math.pi * s))


def zoom_at(t):
    return 1.0 + (ZOOM_END - 1.0) * (t / DURATION) ** ZOOM_SHAPE


# ---------------------------------------------------------------- 배경
def make_background():
    """짙은 네이비-차콜 그라데이션 + 중앙 은은한 광량 + 비네팅."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / (H - 1.0)

    top = np.array([17, 26, 41], np.float32)
    bottom = np.array([8, 12, 20], np.float32)
    bg = top[None, None, :] * (1.0 - v)[..., None] + bottom[None, None, :] * v[..., None]

    # 더미가 놓일 자리에 아주 옅은 광량
    nx = (xx - W * 0.5) / (W * 0.62)
    ny = (yy - H * 0.46) / (H * 0.70)
    glow = np.clip(1.0 - (nx * nx + ny * ny), 0.0, 1.0) ** 1.8
    bg += glow[..., None] * np.array([13, 21, 34], np.float32)

    # 비네팅
    vx = (xx - W * 0.5) / (W * 0.5)
    vy = (yy - H * 0.5) / (H * 0.5)
    vign = np.clip(1.0 - 0.34 * (vx * vx + vy * vy) ** 1.25, 0.0, 1.0)
    bg *= vign[..., None]

    return Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB")


# ---------------------------------------------------------------- 종이 그리기
def paste_shadow(frame, w, h, angle, cx, cy, blur, opacity, off_y, off_x=0.0):
    mask = Image.new("L", (max(w, 1), max(h, 1)), 255)
    mask = mask.rotate(angle, resample=Image.BICUBIC, expand=True)
    if blur > 0.4:
        pad = int(blur * 2.4) + 2
        mask = Image.new("L", (mask.width + pad * 2, mask.height + pad * 2), 0)
        base = Image.new("L", (max(w, 1), max(h, 1)), 255).rotate(
            angle, resample=Image.BICUBIC, expand=True
        )
        mask.paste(base, (pad, pad))
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    lut = [int(round(i * opacity)) for i in range(256)]
    mask = mask.point(lut)
    x = int(round(cx + off_x - mask.width / 2.0))
    y = int(round(cy + off_y - mask.height / 2.0))
    frame.paste(Image.new("RGB", mask.size, (0, 0, 0)), (x, y), mask)


def paste_paper(frame, src, w, h, angle, cx, cy):
    sprite = src.resize((max(w, 1), max(h, 1)), Image.LANCZOS).convert("RGBA")
    sprite = sprite.rotate(angle, resample=Image.BICUBIC, expand=True)
    x = int(round(cx - sprite.width / 2.0))
    y = int(round(cy - sprite.height / 2.0))
    frame.paste(sprite.convert("RGB"), (x, y), sprite.split()[3])


# ---------------------------------------------------------------- 메인
def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    sources = []
    for name in FILES:
        path = os.path.join(IMG_DIR, name)
        if not os.path.exists(path):
            sys.exit("이미지를 찾을 수 없습니다: %s" % path)
        sources.append(Image.open(path).convert("RGB"))

    aspect = sources[0].width / sources[0].height
    for s in sources[1:]:
        if abs(s.width / s.height - aspect) > 1e-3:
            sys.exit("이미지 비율이 서로 다릅니다. 원본 비율을 유지할 수 없습니다.")
    paper_h = PAPER_W / aspect

    background = make_background()
    cx0, cy0 = W / 2.0, H / 2.0

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-",
        "-an",
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
        "-preset", "slow", "-crf", "19",
        "-pix_fmt", "yuv420p",
        "-x264-params", "keyint=60:min-keyint=30:scenecut=0",
        "-movflags", "+faststart",
        OUT_PATH,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    for f in range(N_FRAMES):
        t = f / float(FPS)
        z = zoom_at(t)
        frame = background.copy()

        for i, cfg in enumerate(LAYOUT):
            t_start = T_FIRST + i * STAGGER
            if t < t_start:
                break                              # 아직 등장 전(빈 배경)
            p = min((t - t_start) / DROP, 1.0)

            e_pos = ease_land(p)                   # 세로 위치 + 미세 바운스
            e_xy = ease_out_cubic(p)               # 좌우 이동 / 회전
            high = max(0.0, min(1.0, 1.0 - e_pos))  # 안착면 위로 떠 있는 정도

            land_x = cx0 + cfg["dx"] * z
            land_y = cy0 + cfg["dy"] * z
            x = land_x + cfg["drift"] * z * (1.0 - e_xy)
            y = Y_START * z + (land_y - Y_START * z) * e_pos
            angle = cfg["angle"] + cfg["d_angle"] * (1.0 - e_xy)

            scale = cfg["lift"] * z * (1.0 + 0.045 * (1.0 - e_xy))
            w = int(round(PAPER_W * scale))
            h = int(round(paper_h * scale))

            # 떠 있을수록 그림자는 멀고 크고 옅게, 안착하면 짧고 진하게
            paste_shadow(frame, w, h, angle, x, y,
                         blur=(11.0 + 46.0 * high) * z,
                         opacity=0.38 - 0.14 * high,
                         off_y=(8.0 + 52.0 * high) * z,
                         off_x=2.0 * z * (1.0 - high))
            if high < 0.02:
                # 안착한 종이는 접지 그림자를 한 겹 더 얹어 입체감을 준다
                paste_shadow(frame, w, h, angle, x, y,
                             blur=3.5 * z, opacity=0.30,
                             off_y=3.0 * z, off_x=1.0 * z)

            paste_paper(frame, sources[i], w, h, angle, x, y)

        proc.stdin.write(frame.tobytes())
        if (f + 1) % 30 == 0:
            print("  %3d / %d 프레임" % (f + 1, N_FRAMES), flush=True)

    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        sys.exit("ffmpeg 인코딩 실패 (code %d)" % rc)
    print("완료: %s (%.2f MB)" % (OUT_PATH, os.path.getsize(OUT_PATH) / 1048576.0))


if __name__ == "__main__":
    main()
