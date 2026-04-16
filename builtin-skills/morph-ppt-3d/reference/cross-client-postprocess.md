# Cross-Client Post-Processing

After `officecli close`, replace every 3D model's 1x1 gray fallback image with a branded preview card. Non-PowerPoint clients (WPS, Keynote, Google Slides, LibreOffice) display `mc:Fallback` — by default a gray box.

## Step A — Generate preview cards (PIL)

For each slide with a 3D model, generate a 1920x1080 branded PNG:
- Background: deck's primary palette color
- Center: slide title (bold, white, 72pt) + model filename (regular, 40pt)
- Bottom-right: "3D Preview · Open in PowerPoint for live model" (muted, 20pt)

```python
from PIL import Image, ImageDraw, ImageFont

def generate_preview_card(palette_primary, title, model_name, out_path):
    """Generate a branded fallback card for non-PowerPoint viewers."""
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), f"#{palette_primary}")
    draw = ImageDraw.Draw(img)

    try:
        font_title = ImageFont.truetype("arial.ttf", 72)
        font_sub = ImageFont.truetype("arial.ttf", 40)
        font_badge = ImageFont.truetype("arial.ttf", 20)
    except OSError:
        font_title = ImageFont.load_default()
        font_sub = font_title
        font_badge = font_title

    # Title (centered)
    bbox = draw.textbbox((0, 0), title, font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, H // 2 - 80), title, fill="white", font=font_title)

    # Model name (centered, below title)
    bbox2 = draw.textbbox((0, 0), model_name, font=font_sub)
    tw2 = bbox2[2] - bbox2[0]
    draw.text(((W - tw2) // 2, H // 2 + 20), model_name, fill="#FFFFFFCC", font=font_sub)

    # Badge (bottom-right)
    badge = "3D Preview \u00b7 Open in PowerPoint for live model"
    draw.text((W - 520, H - 50), badge, fill="#FFFFFF99", font=font_badge)

    img.save(out_path)
```

## Step B — Replace fallback images inside the .pptx

```python
import zipfile, shutil, tempfile, os
from xml.etree import ElementTree as ET

NS = {
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "a":  "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r":  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

def replace_3d_fallback_images(pptx_path, slide_previews):
    """
    Replace 3D model fallback images in the pptx.
    slide_previews: dict {slide_number: preview_png_path}
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(pptx_path, "r") as zf:
            zf.extractall(tmpdir)

        for slide_num, preview_path in slide_previews.items():
            slide_xml = os.path.join(tmpdir, f"ppt/slides/slide{slide_num}.xml")
            tree = ET.parse(slide_xml)

            # Find r:embed in mc:Fallback > ... > a:blip
            for fb in tree.getroot().iter(f"{{{NS['mc']}}}Fallback"):
                for blip in fb.iter(f"{{{NS['a']}}}blip"):
                    rel_id = blip.get(f"{{{NS['r']}}}embed")
                    if not rel_id:
                        continue
                    # Resolve rel_id -> media file path
                    rels_path = os.path.join(tmpdir, f"ppt/slides/_rels/slide{slide_num}.xml.rels")
                    for rel in ET.parse(rels_path).getroot():
                        if rel.get("Id") == rel_id:
                            target = rel.get("Target")  # e.g. "../media/image3.png"
                            media_file = os.path.normpath(
                                os.path.join(tmpdir, "ppt/slides", target)
                            )
                            shutil.copy(preview_path, media_file)
                            break
                    break

        # Repack
        os.remove(pptx_path)
        with zipfile.ZipFile(pptx_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root_dir, _, files in os.walk(tmpdir):
                for f in files:
                    full = os.path.join(root_dir, f)
                    zf.write(full, os.path.relpath(full, tmpdir))
```

## Step C — Wire into build.py

After the final `officecli close`:

```python
run("officecli", "close", OUTPUT)

# --- Post-processing: replace 3D fallback images ---
slide_previews = {}
for pos in model_positions:
    preview_file = f"slide-{pos['slide']}-preview.png"
    generate_preview_card(
        palette_primary=PALETTE["primary"],
        title=slide_titles[pos["slide"]],
        model_name=os.path.basename(MODEL),
        out_path=preview_file,
    )
    slide_previews[pos["slide"]] = preview_file

replace_3d_fallback_images(OUTPUT, slide_previews)
print(f"Replaced {len(slide_previews)} fallback image(s) for cross-client compatibility.")
```

## Phase 4 — Fallback Verification

After standard morph verification, check:

- Each slide has exactly one `model3d` element
- All models share the same `name` prop
- **Fallback image check:** unzip the pptx and verify every `ppt/media/image*.png` referenced by a 3D model fallback is > 1x1 pixels:
  ```python
  python3 -c "from PIL import Image; img=Image.open('ppt/media/imageN.png'); assert img.size != (1,1), 'placeholder not replaced'"
  ```
- **Cross-client verification:** open in a non-PowerPoint client (WPS / Keynote / LibreOffice) — each slide should show the branded preview card, not a gray box
