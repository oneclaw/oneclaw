<!-- officecli-pptx reference -->
# Recipes (common-issue fix guide)

The recipes below target visual problems that come up frequently in real decks. Each one is a directly executable fix.

### Recipe 1: Section Divider — label text overlapping decorative elements

**Root cause:** the later-added shape sits on top in z-order; if a decorative shape (circle, rectangle) is added *after* the text shape, it covers the text and the title becomes unreadable.

**Fix rules:**
1. **Add order = z-order**: decorative elements (circles, color blocks) must be added first; the text shape is added last — the later-added shape automatically lands on top.
2. **Title text y-position should be 7–10cm** (slide height is 19.05cm) to avoid overlap with top or bottom decorations.
3. To adjust the layering of existing shapes, use `--prop zorder=back` (decoration) or `--prop zorder=front` (text).

```bash
# Correct order (decoration first, text last)
officecli add slides.pptx / --type slide --prop layout=blank --prop "background=1E2761-CADCFC-180"

# Step 1: decoration (large semi-transparent number as a background graphic) — added first, in the back
officecli add slides.pptx "/slide[N]" --type shape --prop text="02" --prop x=2cm --prop y=4cm --prop width=29.87cm --prop height=8cm --prop font=Georgia --prop size=120 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none --prop opacity=0.15

# Step 2: left-side accent bar (optional) — decoration, in the back
officecli add slides.pptx "/slide[N]" --type shape --prop preset=rect --prop fill=FFFFFF --prop opacity=0.2 --prop x=0cm --prop y=7cm --prop width=6cm --prop height=0.4cm --prop line=none

# Step 3: title text — added last, automatically on top, y in 7–10cm range
officecli add slides.pptx "/slide[N]" --type shape --prop text="Financial Performance" --prop x=2cm --prop y=7.5cm --prop width=29.87cm --prop height=3cm --prop font=Georgia --prop size=40 --prop bold=true --prop color=FFFFFF --prop align=center --prop fill=none

# Step 4: subtitle (optional)
officecli add slides.pptx "/slide[N]" --type shape --prop text="Section 2 of 4" --prop x=2cm --prop y=11cm --prop width=29.87cm --prop height=1.5cm --prop font=Calibri --prop size=16 --prop color=CADCFC --prop align=center --prop fill=none
```

**After-the-fact fix (when overlap already occurred):**
```bash
# Send the decorative element to the back
officecli set slides.pptx "/slide[N]/shape[1]" --prop zorder=back
# Bring the text to the front
officecli set slides.pptx "/slide[N]/shape[3]" --prop zorder=front
# Note: zorder operations renumber shape indices — re-run get --depth 1 before further edits
officecli get slides.pptx '/slide[N]' --depth 1
```

---

### Recipe 2: KPI Box — number/text overflowing the box

**Root cause:** the KPI font is too large for the box `height` or `width`; or the box was not sized to accommodate the chosen font.

**Safe font-size formula:**
- `recommended max size (pt) ≤ box_width_cm × character-count divisor`
  - 1–2 chars (e.g. "94%"): cap at `box_width_cm × 10` pt; suggested 60–72pt
  - 3–4 chars (e.g. "1.2M"): cap at `box_width_cm × 7` pt; suggested 48–56pt
  - 5+ chars: cap at `box_width_cm × 5` pt; suggested 36–44pt
- `box height ≥ font_size_cm × 1.5` (1pt ≈ 0.0353cm; 64pt ≈ 2.26cm, so height ≥ 3.4cm)

**Verification (required):** after creating each KPI box, run `officecli view annotated` to confirm there is no overflow.

```bash
# KPI box safety template (9cm-wide box, 3-character number)
# 9cm × 3 chars → max size ≈ 9×7 = 63pt → use 60pt
# box height ≥ 60pt × 0.0353cm × 1.5 ≈ 3.2cm → set 4cm (with margin)

officecli add slides.pptx "/slide[N]" --type shape --prop text="94%" --prop x=2cm --prop y=5cm --prop width=9cm --prop height=4cm --prop font=Georgia --prop size=60 --prop bold=true --prop color=CADCFC --prop align=center --prop valign=center --prop fill=none

# Sublabel (KPI caption, ≤5 words, may be < 16pt)
officecli add slides.pptx "/slide[N]" --type shape --prop text="Customer Retention" --prop x=2cm --prop y=9.2cm --prop width=9cm --prop height=1.5cm --prop font=Calibri --prop size=13 --prop color=8899BB --prop align=center --prop fill=none
```

**Overflow recovery procedure:**
1. Overflow detected → first shrink the font (drop 4pt at a time and re-check).
2. Font already small enough but overflow remains → increase the box `height` (move y up accordingly).
3. Never shorten the number itself ("$1.2M" must not become "$1M" just to fit).

```bash
# Verification commands
officecli view slides.pptx annotated
# Confirm y+height ≤ 19.05cm for each KPI shape
officecli get slides.pptx '/slide[N]/shape[M]'
```

---

### Recipe 3: Timeline — last node isolated (uneven spacing)

**Root cause:** setting the last node's x directly to `slide_width - right_margin` causes floating-point drift, leaving a slightly larger gap to the previous node — visually "isolated".

**Even-spacing formula:**
```
left_margin   = 2cm (or per design)
right_margin  = 2cm (or per design)
circle_width  = node circle width (e.g. 3cm)

# CRITICAL: usable_width must subtract circle_width, otherwise the last node's right edge will overflow the slide
usable_width = slide_width - left_margin - right_margin - circle_width
             = 33.87 - 2 - 2 - 3 = 26.87cm (standard 16:9, circle_width=3cm)

node_spacing = usable_width / (N - 1)   # N = total node count

node_x[i]   = left_margin + node_spacing × i   # i = 0, 1, ..., N-1
```

> **Why subtract circle_width?** `node_x[i]` is the **left edge x** of the circle, so the last node's right edge = `node_x[N-1] + circle_width`. Without the subtraction, the right edge exceeds the slide edge (33.87cm) and you get a P1 truncation bug.

**Example (4 nodes, 3cm circle):**
```
usable_width = 33.87 - 2 - 2 - 3 = 26.87cm
node_spacing = 26.87 / 3 ≈ 8.957cm

node_x[0] = 2cm              → circle x=2cm,     right edge 5cm    ✓
node_x[1] = 2 + 8.957      = 10.957cm → circle x=10.96cm,   right edge 13.96cm  ✓
node_x[2] = 2 + 8.957×2    = 19.914cm → circle x=19.91cm,   right edge 22.91cm  ✓
node_x[3] = 2 + 8.957×3    = 28.87cm  → circle x=28.87cm,   right edge 31.87cm  ✓ (< 33.87)
```

```bash
# 4-node evenly spaced timeline (node_spacing ≈ 8.957cm, circle 3cm, usable_width=26.87cm)
# Horizontal baseline (from first node's center to last node's center)
officecli add slides.pptx "/slide[N]" --type connector --prop x=3.5cm --prop y=10cm --prop width=27.87cm --prop height=0 --prop line=CADCFC --prop lineWidth=2pt

# Node 1 (i=0)  x = 2cm, right edge 5cm ✓
officecli add slides.pptx "/slide[N]" --type shape --prop preset=ellipse --prop fill=1E2761 --prop x=2cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx "/slide[N]" --type shape --prop text="Q1" --prop x=2cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop fill=none --prop color=FFFFFF --prop size=16 --prop bold=true --prop align=center --prop valign=center

# Node 2 (i=1)  x = 2 + 8.957 = 10.957cm → use 10.96cm, right edge 13.96cm ✓
officecli add slides.pptx "/slide[N]" --type shape --prop preset=ellipse --prop fill=CADCFC --prop x=10.96cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx "/slide[N]" --type shape --prop text="Q2" --prop x=10.96cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop fill=none --prop color=1E2761 --prop size=16 --prop bold=true --prop align=center --prop valign=center

# Node 3 (i=2)  x = 2 + 8.957×2 = 19.914cm → use 19.91cm, right edge 22.91cm ✓
officecli add slides.pptx "/slide[N]" --type shape --prop preset=ellipse --prop fill=1E2761 --prop x=19.91cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx "/slide[N]" --type shape --prop text="Q3" --prop x=19.91cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop fill=none --prop color=FFFFFF --prop size=16 --prop bold=true --prop align=center --prop valign=center

# Node 4 (i=3)  x = 2 + 8.957×3 = 28.871cm → use 28.87cm, right edge 31.87cm ✓ (< 33.87)
officecli add slides.pptx "/slide[N]" --type shape --prop preset=ellipse --prop fill=CADCFC --prop x=28.87cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop line=none
officecli add slides.pptx "/slide[N]" --type shape --prop text="Q4" --prop x=28.87cm --prop y=8.5cm --prop width=3cm --prop height=3cm --prop fill=none --prop color=1E2761 --prop size=16 --prop bold=true --prop align=center --prop valign=center
```

**Verification:** after building the timeline, confirm node x-coordinates are evenly distributed:
```bash
officecli view slides.pptx annotated
# Or check node-by-node
officecli get slides.pptx '/slide[N]' --depth 1
# Manually verify the x-delta between adjacent nodes is consistent (±0.05cm tolerance)
```

If the last node ends up isolated, compute the actual gap (`x[N-1] - x[N-2]` vs `x[1] - x[0]`) and reset its x using the even-spacing formula:
```bash
officecli set slides.pptx "/slide[N]/shape[M]" --prop x=31.87cm
```
