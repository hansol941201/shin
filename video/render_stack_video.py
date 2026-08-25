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
from PIL import Image, ImageChops, ImageFilter

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

BG_SS = 1.10        # 배경을 화면보다 크게 그려두고 카메라가 그 안을 파고든다

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
BW, BH = int(round(W * BG_SS)), int(round(H * BG_SS))


def _fields():
    yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
    return xx / (BW - 1.0), yy / (BH - 1.0)


def make_background():
    """기존 톤(짙은 네이비 → 차콜, 중앙이 가장 밝은 배치)은 그대로 두고,
    그 위에 부드러운 조명 · 옅은 추상 장식 · 바닥면 암시를 아주 낮은 대비로
    얹어 공간감만 더한다. 장식은 문서가 놓이는 중앙에서 거의 지워지므로
    시선은 계속 화면 한가운데에 머문다."""
    fx, fy = _fields()
    ar = BW / float(BH)

    # 1) 세로 기본 그라데이션 (기존과 동일한 색 계열)
    top = np.array([17, 27, 43], np.float32)
    bot = np.array([7, 11, 18], np.float32)
    img = top[None, None, :] * (1.0 - fy)[..., None] + bot[None, None, :] * fy[..., None]

    # 2) 중앙 주광 — 문서가 놓일 자리가 가장 밝다
    key = np.clip(1.0 - (((fx - 0.50) / 0.63) ** 2 + ((fy - 0.44) / 0.71) ** 2), 0, 1) ** 1.8
    img += key[..., None] * np.array([14, 22, 36], np.float32)

    # 3) 왼쪽 위에서 비스듬히 떨어지는 아주 약한 방향광
    img += (np.clip(0.62 * (1.0 - fy) + 0.38 * (1.0 - fx), 0, 1) ** 2.4)[..., None] \
        * np.array([3, 5, 8], np.float32)

    # 4) 문서가 놓이는 면을 암시하는 옅은 수평 띠 + 아래쪽 감광
    img += np.exp(-(((fy - 0.71) / 0.15) ** 2))[..., None] * np.array([3, 5, 9], np.float32)
    img -= (np.clip((fy - 0.78) / 0.22, 0, 1) ** 1.5)[..., None] * np.array([3, 5, 8], np.float32)

    # 5) 추상 장식 — 동심원 호, 사선 광선, 큰 블러 덩어리, 헤어라인
    dec = np.zeros((BH, BW), np.float32)

    def arcs(cx, cy, radii, width, weight):
        r = np.sqrt(((fx - cx) * ar) ** 2 + (fy - cy) ** 2)
        for rad in radii:
            dec[:] += weight * np.exp(-(((r - rad) / width) ** 2))

    arcs(-0.14, -0.10, (0.62, 0.80, 1.03, 1.29), 0.016, 0.90)
    arcs(1.16, 1.12, (0.52, 0.68, 0.92), 0.018, 0.75)

    sweep = fx * 0.60 + fy * 0.80
    dec += 0.45 * np.exp(-(((sweep - 0.34) / 0.13) ** 2))
    dec += 0.28 * np.exp(-(((sweep - 1.14) / 0.10) ** 2))

    for bx, by, bs, bw in ((0.13, 0.20, 0.26, 0.40), (0.89, 0.16, 0.23, 0.34),
                           (0.08, 0.86, 0.24, 0.32), (0.94, 0.84, 0.22, 0.28)):
        dec += bw * np.exp(-(((fx - bx) ** 2 + ((fy - by) / ar) ** 2) / (2 * bs * bs)))

    line = fx * 0.88 - fy * 0.47
    for c in (-0.26, -0.11, 0.04, 0.36, 0.55, 0.70):
        dec += 0.42 * np.exp(-(((line - c) / 0.0030) ** 2))

    guard = 1.0 - 0.94 * np.exp(-((((fx - 0.5) / 0.36) ** 2) + (((fy - 0.50) / 0.30) ** 2)))
    dec = np.clip(dec, 0.0, 1.0) * guard
    img += dec[..., None] * np.array([7, 11, 18], np.float32)

    # 6) 비네팅 — 가장자리를 눌러 중앙으로 시선을 모은다
    r2 = ((fx - 0.5) / 0.5) ** 2 + ((fy - 0.5) / 0.5) ** 2
    img *= np.clip(1.0 - 0.36 * r2 ** 1.35, 0.0, 1.0)[..., None]

    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def make_pool_mask():
    """더미 아래에 넓게 깔리는 은은한 앰비언트 그림자."""
    fx, fy = _fields()
    d = ((fx - 0.500) / 0.42) ** 2 + ((fy - 0.545) / 0.20) ** 2
    pool = np.exp(-(d ** 1.05)) - np.exp(-1.0)
    pool = np.clip(pool / (1.0 - np.exp(-1.0)), 0.0, 1.0)
    return Image.fromarray((pool * 255).astype(np.uint8), "L")


def make_grain():
    """화면 고정형 미세 질감. 반해상도 노이즈를 키워 필름 그레인처럼 뭉치게 한다."""
    rng = np.random.default_rng(20260825)
    small = rng.normal(0.0, 3.0, (H // 2, W // 2, 3)).astype(np.float32)
    small += rng.normal(0.0, 1.2, (H // 2, W // 2, 1))
    g = Image.fromarray(np.clip(small + 128.0, 0, 255).astype(np.uint8), "RGB")
    return g.resize((W, H), Image.BILINEAR)


def make_lens_vignette():
    """합성이 끝난 화면 전체에 아주 약하게 얹는 렌즈 비네팅."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r2 = ((xx / (W - 1.0) - 0.5) / 0.5) ** 2 + ((yy / (H - 1.0) - 0.5) / 0.5) ** 2
    v = np.clip(1.0 - 0.10 * r2 ** 1.4, 0.0, 1.0) * 255.0
    return Image.merge("RGB", [Image.fromarray(v.astype(np.uint8), "L")] * 3)


def cam_crop(img, z):
    """배경/풀 마스크에서 카메라 배율 z에 해당하는 영역을 잘라 화면 크기로."""
    cw, ch = BW / z, BH / z
    box = ((BW - cw) / 2.0, (BH - ch) / 2.0, (BW + cw) / 2.0, (BH + ch) / 2.0)
    return img.resize((W, H), Image.BICUBIC, box=box)


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
    pool_mask = make_pool_mask()
    grain = make_grain()
    lens_vignette = make_lens_vignette()
    black_full = Image.new("RGB", (W, H), (0, 0, 0))
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

        # 배경(카메라 배율 반영) + 화면 고정 미세 질감
        frame = cam_crop(background, z)
        frame = ImageChops.add(frame, grain, 1.0, -128)

        # 더미가 쌓일수록 바닥에 넓은 앰비언트 그림자가 서서히 짙어진다
        settled = 0.0
        for i, cfg in enumerate(LAYOUT):
            ts = T_FIRST + i * STAGGER
            if t < ts:
                break
            settled += min(max(ease_land(min((t - ts) / DROP, 1.0)), 0.0), 1.0)
        if settled > 0.0:
            opacity = 0.30 * (settled / len(LAYOUT))
            lut = [int(round(v * opacity)) for v in range(256)]
            frame.paste(black_full, (0, 0), cam_crop(pool_mask, z).point(lut))

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

        frame = ImageChops.multiply(frame, lens_vignette)
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
