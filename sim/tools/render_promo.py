#!/usr/bin/env python3
"""Offline renderer for the SledPack concept film (SIM-033).

Concept visualisation only: every frame is a simulated render, not real footage;
G-MATURE is closed and no physical test has been run. The honesty tag is burned
into every frame by the overlay layer.

Pipeline (deterministic, frame-stepped, no real-time capture):
  1. 3D layer   sim/promo.html          -> FRAMES/3d/%05d.png (+ anchors.json)
  2. text layer sim/promo_overlay.html  -> FRAMES/ov_<lang>/%05d.png (transparent)
  3. music bed  synthesized here (numpy sine pads, no third-party audio)
  4. ffmpeg     upscale 3D, composite text, H.264 yuv420p CRF 18 +faststart

Usage (from the repo root):
  python3 sim/tools/render_promo.py                 # everything, both languages
  python3 sim/tools/render_promo.py --stage 3d      # only the (slow) 3D layer, resumable
  python3 sim/tools/render_promo.py --stage text    # overlay + encode (after editing copy.json)
  python3 sim/tools/render_promo.py --stage encode --keep  # re-encode from kept frames
Options: --fps 24 --w 1280 --h 720 --quality low --langs zh,en --frames DIR --keep
"""
import argparse, json, os, shutil, socket, subprocess, sys, time, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIM = ROOT / 'sim'
COPY = ROOT / 'research/sledpack_2026_10_21/video/copy.json'
V = {'page': 'promo.html', 'overlay': 'promo_overlay.html', 'copy': COPY, 'out': 'sledpack_promo_{lang}_v1.mp4', 'stills': (4, 9, 15, 21, 26, 31, 34, 38, 43, 50, 55.5, 61, 70, 78), 'prefix': 'v1_'}
V2 = {'page': 'promo2.html', 'overlay': 'promo2_overlay.html', 'copy': ROOT / 'research/sledpack_2026_10_21/video/copy_v2.json', 'out': 'sledpack_promo_{lang}.mp4', 'stills': (4, 9, 14, 19, 22, 24, 31, 33, 36.5, 42, 47.5, 51.5, 55, 59.5, 62, 66, 69, 78, 88), 'prefix': ''}
OUTDIR = ROOT / 'output/video'
DEFAULT_FRAMES = Path('/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/promo_frames')
PORT = 8793
CHROME_ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
DURATION = 86.0  # v1; v2 reads it from the page (window.__promo.duration)


def ensure_server():
    s = socket.socket()
    try:
        s.connect(('127.0.0.1', PORT)); s.close(); return None
    except OSError:
        pass
    p = subprocess.Popen(['node', str(SIM / 'tools/serve.mjs'), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    return p


def launch(pw):
    exe = '/usr/bin/google-chrome' if Path('/usr/bin/google-chrome').exists() else None
    return pw.chromium.launch(executable_path=exe, args=CHROME_ARGS)


def render_3d(a, frames):
    from playwright.sync_api import sync_playwright
    d3 = frames / '3d'; d3.mkdir(parents=True, exist_ok=True)
    anc_path = frames / 'anchors.json'
    anchors = json.loads(anc_path.read_text()) if anc_path.exists() else {}
    n = int(round(DURATION * a.fps))
    todo = [i for i in range(a.start, min(n, a.end if a.end else n)) if not (d3 / f'{i:05d}.png').exists()]
    if not todo:
        print('3d: all frames present'); return
    sx = 1920 / a.w
    with sync_playwright() as pw:
        b = launch(pw)
        pg = b.new_page(viewport={'width': a.w, 'height': a.h})
        pg.set_default_timeout(600000)
        pg.goto(f'http://localhost:{PORT}/{V["page"]}?quality={a.quality}')
        pg.wait_for_function('window.__promo && window.__promo.ready', timeout=600000)
        # pre-roll 1 s before the first frame so spray/tracks are continuous after a resume
        t_first = todo[0] / a.fps
        for k in range(10, 0, -1):
            pg.evaluate(f'window.__promo.seek({max(0.0, t_first - k * 0.1)})')
        t0 = time.time()
        for c, i in enumerate(todo):
            t = i / a.fps
            r = pg.evaluate(f'window.__promo.seek({t})')
            pg.screenshot(path=str(d3 / f'{i:05d}.png'))
            anchors[str(i)] = {k: [round(v[0] * sx), round(v[1] * sx)] for k, v in (r.get('anchors') or {}).items()}
            if c % 24 == 0 or c == len(todo) - 1:
                anc_path.write_text(json.dumps(anchors))
                el = time.time() - t0
                print(f'3d {i}/{n} t={t:.2f} {el / (c + 1):.1f} s/frame, eta {(len(todo) - c - 1) * el / (c + 1) / 60:.0f} min', flush=True)
        b.close()


def render_text(a, frames, lang):
    from playwright.sync_api import sync_playwright
    dov = frames / f'ov_{lang}'
    if dov.exists(): shutil.rmtree(dov)
    dov.mkdir(parents=True)
    copy = json.loads(V['copy'].read_text())
    anchors = json.loads((frames / 'anchors.json').read_text()) if (frames / 'anchors.json').exists() else {}
    n = int(round(DURATION * a.fps))
    with sync_playwright() as pw:
        b = launch(pw)
        pg = b.new_page(viewport={'width': 1920, 'height': 1080})
        pg.goto(f'http://localhost:{PORT}/{V["overlay"]}')
        pg.wait_for_function('window.__ov && window.__ov.ready')
        pg.evaluate('([c, l]) => window.__ov.setCopy(c, l)', [copy, lang])
        pg.evaluate('document.fonts.ready')
        last = None
        for i in range(n):
            t = i / a.fps
            pg.evaluate('([t, an]) => window.__ov.seek(t, an)', [t, anchors.get(str(i), {})])
            # identical consecutive overlays are common: hash the DOM state to reuse the PNG
            sig = pg.evaluate('document.getElementById("stage").innerHTML')
            dst = dov / f'{i:05d}.png'
            if sig == last and i > 0:
                os.link(dov / f'{i - 1:05d}.png', dst)
            else:
                pg.screenshot(path=str(dst), omit_background=True)
            last = sig
            if i % 240 == 0: print(f'text {lang} {i}/{n}', flush=True)
        b.close()


def music(path, dur, sr=44100):
    """Gentle ambient pad: slow chord changes (Dmaj9 – Bm11 – Gmaj7 – Aadd9), soft attack, airy shimmer."""
    import numpy as np
    t = np.arange(int(dur * sr)) / sr
    chords = [[146.83, 220.0, 277.18, 329.63, 440.0], [123.47, 185.0, 246.94, 329.63, 369.99],
              [98.0, 196.0, 246.94, 293.66, 369.99], [110.0, 220.0, 277.18, 329.63, 493.88]]
    seg = 10.25
    out = np.zeros_like(t)
    for ci in range(int(dur / seg) + 2):
        ch = chords[ci % 4]
        c0 = ci * seg
        env = np.clip((t - c0 + 2.5) / 3.0, 0, 1) * np.clip((c0 + seg + 2.5 - t) / 3.0, 0, 1)
        env = env * env * (3 - 2 * env)
        for k, f in enumerate(ch):
            det = 1 + 0.0016 * np.sin(2 * np.pi * 0.07 * t + k)
            out += env * (0.16 / (1 + 0.35 * k)) * (np.sin(2 * np.pi * f * det * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t + k))
    # shimmer: high partials with slow tremolo
    out += 0.025 * np.sin(2 * np.pi * 1760 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t)) * np.clip(t / 8, 0, 1)
    # soft pulse in the riding section (22–47 s)
    ride = np.clip((t - 22) / 2, 0, 1) * np.clip((47 - t) / 2, 0, 1)
    out += ride * 0.09 * np.sin(2 * np.pi * 73.42 * t) * (0.5 + 0.5 * np.cos(2 * np.pi * 2.0 * t)) ** 4
    # simple feedback-free reverb: sum of delayed copies
    rev = np.zeros_like(out)
    for dly, g in [(0.113, 0.35), (0.197, 0.28), (0.293, 0.22), (0.411, 0.16), (0.577, 0.1)]:
        n = int(dly * sr); rev[n:] += g * out[:-n]
    out = out + rev
    out *= np.clip(t / 2.5, 0, 1) * np.clip((dur - t) / 4.0, 0, 1)
    out = out / (np.max(np.abs(out)) + 1e-9) * 0.5
    st = np.stack([out, np.roll(out, int(0.011 * sr))], 1)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((st * 32767).astype('<i2').tobytes())


def encode(a, frames, lang):
    OUTDIR.mkdir(parents=True, exist_ok=True)
    wav = frames / 'music.wav'
    if not wav.exists(): music(wav, DURATION)
    out = OUTDIR / V['out'].format(lang=lang)
    fc = ('[0:v]scale=1920:1080:flags=lanczos,format=rgba[bg];'
          '[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(a.fps), '-i', str(frames / '3d/%05d.png'),
           '-framerate', str(a.fps), '-i', str(frames / f'ov_{lang}/%05d.png'), '-i', str(wav),
           '-filter_complex', fc, '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M',
           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
           '-metadata', 'comment=Concept visualisation, simulated render, not real footage, not physically tested (SIM-033)', str(out)]
    subprocess.run(cmd, check=True)
    print('wrote', out, f'{out.stat().st_size / 1e6:.1f} MB')
    # review stills
    st = OUTDIR / 'stills'; st.mkdir(exist_ok=True)
    for ts in V['stills']:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(ts), '-i', str(out), '-frames:v', '1', str(st / f"{V['prefix']}{lang}_{ts:05.1f}.png")], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', default='all', choices=['all', '3d', 'text', 'encode'])
    ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--w', type=int, default=1280)
    ap.add_argument('--h', type=int, default=720)
    ap.add_argument('--quality', default='promo')
    ap.add_argument('--langs', default='zh,en')
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--end', type=int, default=0)
    ap.add_argument('--frames', default=str(DEFAULT_FRAMES))
    ap.add_argument('--keep', action='store_true', help='keep frame folders after encoding')
    ap.add_argument('--v2', action='store_true', help='SIM-034 v2 cut (kite open on the back)')
    a = ap.parse_args()
    global DURATION
    if a.v2:
        V.update(V2); DURATION = 93.0  # keep in sync with sim/js/promo2/timeline.js
        if a.frames == str(DEFAULT_FRAMES): a.frames = str(DEFAULT_FRAMES) + '_v2'
    frames = Path(a.frames); frames.mkdir(parents=True, exist_ok=True)
    srv = ensure_server()
    try:
        if a.stage in ('all', '3d'):
            render_3d(a, frames)
        if a.stage in ('all', 'text', 'encode'):
            for lang in a.langs.split(','):
                if a.stage != 'encode': render_text(a, frames, lang)
                encode(a, frames, lang)
                if not a.keep: shutil.rmtree(frames / f'ov_{lang}', ignore_errors=True)
    finally:
        if srv: srv.terminate()


if __name__ == '__main__':
    main()
