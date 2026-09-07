#!/usr/bin/env python3
"""내레이션 트랙을 만들어 영상에 얹는다.

각 줄은 자막 큐(cues.json)에 이미 배정된 시작·끝 시각이 있다.
그 슬롯 안에 들어가도록 줄마다 낭독 속도를 맞춘 뒤,
샘플 단위로 정확히 t0 에 놓는다. (타임코드는 절대 건드리지 않는다)

외부 VO 파일이 있으면 그것을 우선 쓴다:
  vo_src/<scene>_<idx>.wav  (예: s1_00.wav) 가 있으면 TTS 대신 그 파일을 쓴다.
"""
import json, os, subprocess, wave, sys, math
import numpy as np

SR       = 22050
ROOT     = os.path.dirname(os.path.abspath(__file__))
CUES     = json.load(open(os.path.join(ROOT,'cues.json')))
OUTDIR   = os.path.join(ROOT,'vo')
SRCDIR   = os.path.join(ROOT,'vo_src')      # 실제 성우 녹음을 넣는 곳
os.makedirs(OUTDIR, exist_ok=True)

VOICE    = os.environ.get('VOICE','ko')
BASE_SPD = int(os.environ.get('SPD','170'))   # 자연스러운 기본 속도
PITCH    = os.environ.get('PITCH','38')
TAIL     = 0.14          # 다음 줄과 붙지 않도록 남기는 꼬리
LEAD     = 0.06          # 큐보다 살짝 늦게 시작해 자막과 붙는 느낌을 준다
MAXSPD   = 330           # 이 이상 빨라지면 알아듣기 어렵다

def read_wav(p):
    with wave.open(p,'rb') as w:
        assert w.getsampwidth()==2, p
        a = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32)/32768.0
        if w.getnchannels()==2: a = a.reshape(-1,2).mean(axis=1)
        if w.getframerate()!=SR:
            n = int(round(len(a)*SR/w.getframerate()))
            a = np.interp(np.linspace(0,len(a)-1,n), np.arange(len(a)), a).astype(np.float32)
    return a

def espeak(text,out,spd):
    subprocess.run(['espeak-ng','-v',VOICE,'-s',str(spd),'-p',PITCH,'-w',out,text],
                   check=True, capture_output=True)
    return read_wav(out)

rows   = CUES['rows']
total  = CUES['TOTAL']
track  = np.zeros(int(math.ceil(total*SR))+SR, dtype=np.float32)
report = []

for r in rows:
    tag  = f"{r['scene']}_{r['idx']:02d}"
    slot = r['t1'] - r['t0'] - TAIL
    src  = os.path.join(SRCDIR, tag+'.wav')
    if os.path.exists(src):                       # 실제 녹음 우선
        a = read_wav(src); spd='(원본)'
    else:
        spd = BASE_SPD
        a   = espeak(r['tx'], os.path.join(OUTDIR,tag+'.wav'), spd)
        # 슬롯을 넘으면 필요한 만큼만 빠르게 다시 읽는다 (피치 유지)
        for _ in range(6):
            d = len(a)/SR
            if d <= slot or spd >= MAXSPD: break
            spd = min(MAXSPD, int(spd * min(1.5, d/slot) + 2))
            a   = espeak(r['tx'], os.path.join(OUTDIR,tag+'.wav'), spd)
    d = len(a)/SR
    # 클릭 방지용 짧은 페이드
    f = min(int(0.012*SR), len(a)//8)
    if f>0:
        a[:f]  *= np.linspace(0,1,f, dtype=np.float32)
        a[-f:] *= np.linspace(1,0,f, dtype=np.float32)
    s = int(round((r['t0']+LEAD)*SR))
    e = min(s+len(a), len(track))
    track[s:e] += a[:e-s]
    report.append((tag, r['t0'], slot+TAIL, d, spd, d>slot+0.02))

# 레벨 정리 : 피크 -3dBFS
pk = float(np.max(np.abs(track))) or 1.0
track = track * (10**(-3/20) / pk)

outwav = os.path.join(ROOT,'narration.wav')
with wave.open(outwav,'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(track,-1,1)*32767).astype('<i2').tobytes())

over = [r for r in report if r[5]]
print(f"{len(rows)}줄 · 트랙 {len(track)/SR:.2f}s · 슬롯 초과 {len(over)}건")
for t,t0,slot,d,spd,bad in report:
    if bad: print(f"  초과 {t} @{t0:6.2f}s  슬롯 {slot:.2f}s < 낭독 {d:.2f}s (speed {spd})")
spds=[r[4] for r in report if isinstance(r[4],int)]
if spds: print(f"낭독 속도 {min(spds)}~{max(spds)} (기본 {BASE_SPD})")
print('->', outwav)
