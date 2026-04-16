# Model-Content Layout & Camera Language

## Size Tier Reference

| Size tier      | Width   | Height  | Area (approx) | When to use                                |
| -------------- | ------- | ------- | ------------- | ------------------------------------------ |
| **XL (bleed)** | 28-36cm | 22-28cm | 600-1000      | Close-up, model extends beyond slide edges |
| **L (hero)**   | 18-24cm | 15-19cm | 270-456       | Title, closing, dramatic moments           |
| **M (split)**  | 13-17cm | 12-16cm | 156-272       | Standard content pages with text           |
| **S (accent)** | 5-10cm  | 5-10cm  | 25-100        | Data-heavy pages, model as icon            |

## Layout Patterns (6 types)

**A — Model right, content left** (content pages)
Content at x=1-14cm. Model at x=15-20cm, width 14-18cm.

**B — Model left, content right** (alternate with A)
Model at x=0-2cm, width 14-18cm. Content at x=18-32cm.

**C — Model centered, text overlay** (title/closing)
Model centered large (18-24cm). Text at slide top or bottom.

**D — Model small corner, content dominant** (data pages)
Model 5-10cm in any corner. Content fills the rest.

**E — Model as backdrop** (impact/quote pages)
Model XL (28-36cm), centered, partially cropped by slide edges.
Text overlaid directly on model area with high-contrast color.

```bash
# Pattern E: model fills slide as backdrop
officecli add deck.pptx '/slide[N]' --type 3dmodel \
  --prop path=model.glb --prop 'name=!!model-hero' \
  --prop x=-2cm --prop y=-2cm --prop width=38cm --prop height=24cm \
  --prop roty=45 --prop rotx=10

# Text overlaid on model
officecli add deck.pptx '/slide[N]' --type shape \
  --prop 'name=#sN-quote' --prop text="Key insight here" \
  --prop x=3cm --prop y=7cm --prop width=28cm --prop height=5cm \
  --prop size=44 --prop bold=true --prop color=FFFFFF --prop fill=none
```

**F — Model bleed edge** (transition/teaser pages)
Model partially off-screen (negative x or y, or x+width > 33.87cm).

```bash
# Pattern F: model bleeds off right edge
officecli add deck.pptx '/slide[N]' --type 3dmodel \
  --prop path=model.glb --prop 'name=!!model-hero' \
  --prop x=20cm --prop y=-1cm --prop width=24cm --prop height=22cm \
  --prop roty=70
```

## Layout Progression

Never repeat the same pattern on consecutive slides. Example:

```
Slide 1: C (centered hero, L)
Slide 2: E (backdrop close-up, XL)   <- 1.5x+ area jump
Slide 3: A (model right, M)          <- pull back
Slide 4: F (bleed edge, L)           <- push in
Slide 5: D (small corner, S)         <- dramatic pull back
Slide 6: B (model left, M)           <- grow
Slide 7: C (centered closing, L)     <- push in
```

## Model Bleed Guidelines

Bleed (Patterns E/F) works for:
- Symmetric objects (spheres, helmets, bottles) — any crop looks intentional.
- Large flat surfaces (cars, buildings) — partial view implies scale.
- Cropping non-critical parts (background, base, stand).

Bleed does NOT work for:
- Character/animal models — cropped ears/tails/limbs look broken.
- Small detailed models — cropping loses the detail.
- When the cropped part is the most recognizable feature.

For character/animal models, keep full model visible and vary rhythm through size tiers (L->M->S) and `rotx`, not bleed.

---

## Camera Language

Three tools: **roty** (orbit), **rotx** (tilt), **width/height** (zoom).

### Shot Types (use >= 3 different per deck)

| Shot                     | Size                  | rotx       | When                        |
| ------------------------ | --------------------- | ---------- | --------------------------- |
| **Establishing**         | L (18-24cm)           | 0-5        | Title, intro, closing       |
| **Three-quarter beauty** | L (16-20cm)           | 5-10       | Hero, first impression      |
| **Close-up**             | XL (28-36cm), cropped | 0-10       | Feature highlight, detail   |
| **Bird's eye**           | M (13-17cm)           | 25-40      | Structure, overview         |
| **Low angle**            | L (16-20cm)           | -15 to -25 | Power, drama                |
| **Side profile**         | M (13-16cm)           | 0          | Form factor, silhouette     |
| **Over-the-shoulder**    | S (5-10cm)            | 10-15      | Data-heavy, model as accent |

### Content-Driven Camera

Match the shot to what the slide talks about:

- "Front design" -> Close-up, `roty=0`, XL cropped
- "Side profile" -> Side, `roty=90`, M
- "Internal structure" -> Bird's eye, `roty=30, rotx=35`, M
- "Power/authority" -> Low angle, `roty=20, rotx=-20`, L
- "Data & specs" -> Over-the-shoulder, `roty=60`, S in corner

### Rotation Rules

1. Adjacent roty delta: 30-90 deg (< 30 = jitter, > 90 = disorienting)
2. Overall roty direction must be consistent (no back-and-forth)
3. rotx range: -25 to +40. Adjacent rotx delta <= 20
4. Total arc across deck: 180-360 deg (show model from all sides)

### Example Shot Plan

| Slide | Shot                 | roty | rotx | Size     | Pattern |
| ----- | -------------------- | ---- | ---- | -------- | ------- |
| 1     | Three-quarter beauty | 30   | 8    | L 20x17  | C       |
| 2     | Close-up             | 0    | 5    | XL 30x24 | E       |
| 3     | Side profile         | 80   | 0    | M 15x14  | A       |
| 4     | Bird's eye           | 120  | 35   | M 14x13  | B       |
| 5     | Low angle            | 170  | -20  | L 20x18  | F       |
| 6     | Over-the-shoulder    | 220  | 10   | S 8x7    | D       |
| 7     | Establishing         | 320  | 5    | L 20x17  | C       |
