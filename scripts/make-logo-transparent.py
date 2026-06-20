"""
Retire le fond bleu marine de src/assets/logo.png et recadre serré
pour que le logo prenne plus de place. Sauvegarde la version transparente
puis régénère build/icon.ico aux bonnes tailles.

Usage :
    pip install Pillow
    python scripts/make-logo-transparent.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "logo.png"
DST_PNG = ROOT / "src" / "assets" / "logo.png"  # écrase l'original
DST_ICO = ROOT / "build" / "icon.ico"

# Couleur du fond bleu marine à éliminer
BG_HEX = (0x08, 0x16, 0x28)
# Tolérance : tout pixel dont chaque canal est à ±N du fond devient transparent.
TOLERANCE = 35

SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def is_background(r: int, g: int, b: int) -> bool:
    """Vrai si le pixel est proche du bleu marine du fond."""
    return (
        abs(r - BG_HEX[0]) <= TOLERANCE
        and abs(g - BG_HEX[1]) <= TOLERANCE
        and abs(b - BG_HEX[2]) <= TOLERANCE
    )


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"❌ Source introuvable : {SRC}")

    img = Image.open(SRC).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    # Pass 1 : remplace le fond bleu par alpha=0.
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if is_background(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)

    # Pass 2 : recadre serré sur le contenu non transparent.
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # Pass 3 : carre l'image (ajoute du transparent autour si besoin)
    # pour qu'elle reste centrée comme icône.
    w, h = img.size
    side = max(w, h)
    squared = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    squared.paste(img, ((side - w) // 2, (side - h) // 2), img)

    # Sauvegarde le PNG transparent (écrase l'original)
    squared.save(DST_PNG, format="PNG")
    print(f"✅ {DST_PNG} — fond transparent, {squared.size[0]}×{squared.size[1]}px")

    # Régénère l'ICO
    DST_ICO.parent.mkdir(parents=True, exist_ok=True)
    squared.save(DST_ICO, format="ICO", sizes=SIZES)
    print(f"✅ {DST_ICO} ({len(SIZES)} tailles)")


if __name__ == "__main__":
    main()
