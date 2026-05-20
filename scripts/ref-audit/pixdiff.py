#!/usr/bin/env python3
"""Pixel diff helper for the reference-internal-consistency audit.

Reads HTML renders from docs/qa/ref-renders/ and screenshots from the external
reference dir, computes a per-pixel diff (max-channel > threshold), and writes
a red-overlay PNG to docs/qa/ref-diff/<label>.png.

Run from the repo root:
    python3 scripts/ref-audit/pixdiff.py
"""
import os
from PIL import Image, ImageChops

REPO = "/home/docker_admin/develop/focustown-ref-accurancy"
REF = "/home/docker_admin/develop/focustown/reference"
RENDERS = f"{REPO}/docs/qa/ref-renders"
SHOTS = f"{REF}/screenshots"
OUT = f"{REPO}/docs/qa/ref-diff"

PAIRS = [
    (f"{RENDERS}/FocusTown__initial.png", f"{SHOTS}/v6-town.png",        "FocusTown__vs_v6-town"),
    (f"{RENDERS}/FocusTown__initial.png", f"{SHOTS}/v6-town2.png",       "FocusTown__vs_v6-town2"),
    (f"{RENDERS}/FocusTown__initial.png", f"{SHOTS}/v6-after-fixes.png", "FocusTown__vs_v6-after-fixes"),
    (f"{RENDERS}/FocusTown__initial.png", f"{SHOTS}/v5-town.png",        "FocusTown__vs_v5-town"),
    (f"{RENDERS}/FocusTown__initial.png", f"{SHOTS}/v2-town.png",        "FocusTown__vs_v2-town"),
    (f"{RENDERS}/FocusTown-Standalone-bundled__initial.png", f"{SHOTS}/v2-town.png", "Bundled__vs_v2-town"),
    (f"{RENDERS}/FocusTown-Standalone-bundled__initial.png", f"{SHOTS}/v6-town.png", "Bundled__vs_v6-town"),
    (f"{SHOTS}/v6-town.png",  f"{SHOTS}/v2-town.png", "v6-town__vs_v2-town"),
    (f"{SHOTS}/v6-town.png",  f"{SHOTS}/v5-town.png", "v6-town__vs_v5-town"),
    (f"{SHOTS}/v6-town.png",  f"{SHOTS}/v4-town.png", "v6-town__vs_v4-town"),
    (f"{SHOTS}/v6-login.png", f"{SHOTS}/v2-login.png", "v6-login__vs_v2-login"),
    (f"{SHOTS}/v6-login.png", f"{SHOTS}/v4-login-final.png", "v6-login__vs_v4-login-final"),
]


def diff_pair(a_path, b_path, out_path, threshold=15):
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if a.size != b.size:
        b = b.resize(a.size, Image.LANCZOS)
    d = ImageChops.difference(a, b)
    pixels = list(d.getdata())
    diff_count = sum(1 for p in pixels if max(p) > threshold)
    pct = 100.0 * diff_count / len(pixels)
    mask = d.point(lambda v: 255 if v > threshold else 0).convert("L")
    overlay = Image.new("RGB", a.size, (255, 0, 0))
    Image.composite(overlay, a, mask).save(out_path)
    print(f"{os.path.basename(a_path)} vs {os.path.basename(b_path)}: {pct:.1f}% diff -> {out_path}")
    return pct


def main():
    os.makedirs(OUT, exist_ok=True)
    for a, b, label in PAIRS:
        diff_pair(a, b, f"{OUT}/{label}.png")


if __name__ == "__main__":
    main()
