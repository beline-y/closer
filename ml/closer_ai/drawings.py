"""Every drawing reduced to a DrawingReading: colors computed here, content read by Claude.

The colors come from the pixels (Pillow and numpy), so they cost nothing and never change
for the same image. What is drawn (people, faces, setting, explicit feelings, danger) comes
from Claude's vision. The image is used once and never stored: the store keeps the reading,
its vector and a hash of the image, so the same drawing is never counted twice.
"""

from __future__ import annotations

import hashlib
import io

import numpy as np
from PIL import Image

from .contract import DrawingReading

THUMB = 256  # pixels on the long side, enough for color statistics
SEND = 1024  # pixels on the long side for Claude: plenty for a child's drawing, cheap in tokens


def _rgb(image: bytes) -> Image.Image:
    """Decoded image on a white sheet (transparent areas count as paper)."""
    picture = Image.open(io.BytesIO(image))
    picture.load()
    if picture.mode in ("RGBA", "LA", "P"):
        picture = picture.convert("RGBA")
        sheet = Image.new("RGBA", picture.size, (255, 255, 255, 255))
        picture = Image.alpha_composite(sheet, picture)
    return picture.convert("RGB")


def image_hash(image: bytes) -> str:
    return hashlib.sha256(image).hexdigest()


def prepare(image: bytes) -> tuple[bytes, str]:
    """A JPEG of at most SEND pixels on the long side, for Claude."""
    picture = _rgb(image)
    picture.thumbnail((SEND, SEND))
    out = io.BytesIO()
    picture.save(out, format="JPEG", quality=85)
    return out.getvalue(), "image/jpeg"


def color_features(image: bytes) -> dict[str, float]:
    """Brightness, saturation, dark ink, hues used, ink coverage and warmth of the drawing."""
    picture = _rgb(image)
    picture.thumbnail((THUMB, THUMB))
    hsv = np.asarray(picture.convert("HSV"), dtype=float) / 255.0
    h, s, v = hsv[..., 0].ravel(), hsv[..., 1].ravel(), hsv[..., 2].ravel()
    ink = ~((v > 0.88) & (s < 0.15))  # anything that is not white paper
    if not ink.any():
        return {"brightness": 1.0, "saturation": 0.0, "dark_share": 0.0, "colors": 0, "coverage": 0.0, "warm_share": 0.0}
    hi, si, vi = h[ink], s[ink], v[ink]
    colored = (si > 0.25) & (vi > 0.25)
    bins = np.bincount((hi[colored] * 12).astype(int) % 12, minlength=12) if colored.any() else np.zeros(12)
    hues = int(np.sum(bins >= 0.03 * ink.sum()))
    degrees = hi[colored] * 360
    warm = ((degrees < 70) | (degrees >= 330)).mean() if colored.any() else 0.0
    return {
        "brightness": round(float(vi.mean()), 3), "saturation": round(float(si.mean()), 3),
        "dark_share": round(float((vi < 0.3).mean()), 3), "colors": hues, "coverage": round(float(ink.mean()), 3),
        "warm_share": round(float(warm), 3),
    }


def analyze(image: bytes, reader=None, title: str | None = None) -> DrawingReading:
    """The full reading: colors always, content when Claude is available (reader: ClaudeReader)."""
    colors = color_features(image)
    content = reader.read_drawing(*prepare(image), title=title) if reader is not None else None
    if content is None:
        return DrawingReading(**colors)
    return DrawingReading(**colors, **content, read_by_claude=True)
