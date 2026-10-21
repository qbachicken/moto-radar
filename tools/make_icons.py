import os
from PIL import Image, ImageDraw

os.makedirs("icons", exist_ok=True)

def generate_icon(size, filename, maskable=False):
    img = Image.new("RGBA", (size, size), (5, 7, 13, 255))
    draw = ImageDraw.Draw(img)

    pad = int(size * 0.15) if maskable else int(size * 0.05)
    box = [pad, pad, size - pad, size - pad]

    # Outer glowing ring
    draw.ellipse(box, outline=(34, 211, 238, 180), width=max(4, size // 50))

    # Inner radar elements
    center = size // 2
    r1 = size // 3
    draw.ellipse([center - r1, center - r1, center + r1, center + r1], outline=(59, 130, 246, 120), width=max(2, size // 80))

    r2 = size // 6
    draw.ellipse([center - r2, center - r2, center + r2, center + r2], outline=(255, 59, 92, 200), width=max(2, size // 80))

    # Center dot (amber blip)
    r3 = size // 16
    draw.ellipse([center - r3, center - r3, center + r3, center + r3], fill=(251, 191, 36, 255))

    img.save(os.path.join("icons", filename), "PNG")

generate_icon(192, "icon-192.png", maskable=False)
generate_icon(512, "icon-512.png", maskable=False)
generate_icon(512, "icon-maskable-512.png", maskable=True)
print("Icons generated successfully in icons/")
