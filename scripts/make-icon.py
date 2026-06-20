"""
Génère build/icon.ico multi-tailles depuis src/assets/logo.png.
Utilisé par electron-builder pour l'icône Windows (taskbar, installeur, .exe).

Usage :
    pip install Pillow
    python scripts/make-icon.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "logo.png"
DST = ROOT / "build" / "icon.ico"

# Tailles standard Windows pour icônes d'application.
# 256 est le max supporté par le format ICO.
SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"❌ Source introuvable : {SRC}")

    DST.parent.mkdir(parents=True, exist_ok=True)

    # Charge en RGBA pour préserver la transparence si présente.
    img = Image.open(SRC).convert("RGBA")
    w, h = img.size

    # Recadre en carré centré si l'image n'est pas déjà carrée.
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))

    # Pillow génère toutes les tailles à partir de l'image source.
    img.save(DST, format="ICO", sizes=SIZES)
    print(f"✅ {DST} ({len(SIZES)} tailles : {', '.join(f'{s[0]}px' for s in SIZES)})")


if __name__ == "__main__":
    main()
