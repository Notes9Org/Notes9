#!/usr/bin/env python3
"""
Remove opaque checkerboard / square backdrop from notes9-mascot.png via edge flood-fill.
Inner whites stay opaque (sealed by the black circular ring).
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src = root / "public" / "notes9-mascot.png"
    out = root / "public" / "notes9-mascot-ui.png"

    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size

    def lum_at(x: int, y: int) -> float:
        r, g, b, _ = px[x, y]
        return (r + g + b) / 3.0

    def is_barrier(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a < 200:
            return False
        # Thick black strokes / ring block the flood into the logo interior
        return (r + g + b) / 3 < 95

    seen = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= w or y >= h or seen[x][y] or is_barrier(x, y):
            return
        seen[x][y] = True
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and not is_barrier(nx, ny):
                seen[nx][ny] = True
                q.append((nx, ny))

    cleared = 0
    for x in range(w):
        for y in range(h):
            if seen[x][y]:
                px[x, y] = (0, 0, 0, 0)
                cleared += 1

    # Inner “transparency” checkerboard is still opaque inside the ring — flatten to paper white
    flattened = 0
    for x in range(w):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            lum = (r + g + b) / 3.0
            sat = max(r, g, b) - min(r, g, b)
            if sat < 38 and lum > 148:
                px[x, y] = (255, 255, 255, 255)
                flattened += 1

    img.save(out, optimize=True)
    print(
        f"Wrote {out} ({w}x{h}), edge-cleared {cleared} px, inner-flattened {flattened} px"
    )


if __name__ == "__main__":
    main()
