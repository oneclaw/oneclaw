---
name: morph-ppt-3d
description: "3D Morph PPT — 在 morph-ppt 基础上扩展 GLB 3D 模型、电影运镜和丰富视觉设计系统"
metadata:
  {
    "openclaw":
      {
        "emoji": "🎬",
        "os": ["darwin", "linux", "win32"],
        "requires": { "bins": ["officecli"] },
      },
  }
---

# Morph PPT — 3D Extension

**Extends** `morph-ppt`. All morph-ppt rules apply (shape naming, auto-ghost, ghost-section, verification, design). This file covers only **3D-specific additions**.

## Use when

Activate this skill when the user's intent matches any of the following:

| Intent | Example expressions |
|--------|-------------------|
| PPT 加 3D 模型 / Add 3D model to PPT | "add a 3D model to the PPT", "在PPT里加个3D模型", "用GLB做个演示", "PPT里放个三维模型" |
| 3D Morph 动画 / 3D Morph animation | "make the 3D model rotate between slides", "3D模型加Morph动画", "让模型在幻灯片间旋转", "3D转场效果" |
| 电影级 3D 展示 / Cinematic 3D presentation | "cinematic product showcase", "做个产品3D展示PPT", "像电影一样展示产品", "做个酷炫的3D汇报" |

**Intent parsing rules:**

1. **3D signal words**: `.glb`, `3D`, `三维`, `模型`, `model`, `旋转`, `rotate`, `GLB` → this skill, not morph-ppt
2. **Inherit parent**: pure PPT/Morph requests without 3D signals → delegate to morph-ppt
3. **Implicit intent**: product showcase + model file present → confirm if 3D is wanted
4. **Negative signals**: do NOT activate for 2D-only morph, pure animation, or image-based PPT

---

## 3D Model Compatibility Gate

1. Only `.glb` supported. If user provides `.fbx` / `.obj` / `.blend` / `.usdz` / `.gltf`, ask them to convert to `.glb` first.
2. If user has no model, open and read `{baseDir}/reference/model-discovery.md` for the discovery flow.
3. All files (`.glb`, `.pptx`, build script) must be in the same working directory.

---

## Cross-Client Compatibility

3D Morph only works in **PowerPoint 16+**. Other clients fall back to `mc:Fallback` — by default a 1×1 gray placeholder.

**Mandatory:** `build.py` must post-process the `.pptx` after `officecli close` to replace every fallback image with a branded preview card. See `{baseDir}/reference/cross-client-postprocess.md` for implementation.

---

## 3D Model Insertion Rules

### Add model fresh on every slide — NEVER clone

`morph_clone_slide` copies the model as frozen XML. The cloned model cannot Morph. Each slide must call `add --type 3dmodel` independently with the **same `name`** prop.

**CRITICAL: Cloning a slide with a 3D model creates TWO model3d elements with the same name. PowerPoint deletes the model content during repair.**

If you must clone a slide for scene actors, **immediately remove the cloned model before adding a new one:**

```bash
officecli remove deck.pptx '/slide[2]/model3d[1]'  # remove frozen clone
officecli add deck.pptx '/slide[2]' --type 3dmodel ...  # add fresh
```

**Recommended: Do NOT clone slides with 3D models.** Create all slides empty, add models fresh on each with the same `name` but different position/rotation — Morph animates the transition.

### Controllable properties

| Property          | What it does              | Notes                                     |
| ----------------- | ------------------------- | ----------------------------------------- |
| `x`, `y`          | Position on slide         | Standard slide coordinates                |
| `width`, `height` | Frame size                | Model renders inside this frame           |
| `name`            | Shape name                | Must be identical across slides for Morph |
| `roty`            | Y-axis rotation (degrees) | Primary storytelling axis                 |
| `rotx`            | X-axis tilt (degrees)     | Range -25 to +40                          |
| `rotz`            | Z-axis roll (degrees)     | Rarely needed                             |

### Do NOT manually set

`meterPerModelUnit`, `preTrans`, `camera` depth/position — all auto-computed. Never use `raw-set` on 3D transform parameters.

---

## Layout — Size Contrast Rule (MANDATORY)

Adjacent slides must differ in model area by >= 1.5x or <= 0.67x. Area = width × height. This is the single most important rule for visual energy — never reuse a similar size on consecutive slides.

Full guidelines in `{baseDir}/reference/layout-and-camera.md` — size tiers, 6 layout patterns (A-F), camera language, rotation rules, and shot plan.

---

## Text Layout Safety (MANDATORY)

1. **Title/body collision.** If title wraps to 2 lines, body `y` must account for actual title height: `body_y = title_y + title_height + 0.5cm`.
2. **Generous heights.** Title 3-4cm, body 6-8cm, bullets 8-10cm. Fixed heights overflow invisibly.
3. **Model/text gap >= 1cm.** If model starts at `x=15cm`, text `x + width` must be <= 14cm.
4. **Pattern C (centered model).** Text at slide top (`y=0.5-2cm`) or bottom (`y=14-17cm`), never vertical middle where model lives.
5. **Verify per slide.** `officecli get deck.pptx '/slide[N]' --depth 1` — no overlapping shape ranges.

---

## Workflow

### Phase 2 — Planning

In `brief.md`, add a **Model Choreography Table**:

| Slide | Pattern | Size Tier | Model x,y,w,h | roty | rotx |
|-------|---------|-----------|---------------|------|------|
| 1     | C       | L         | 7,0.5,20,17   | 30   | 8    |
| 2     | E       | XL        | -2,-2,38,24   | 0    | 5    |

Verify area ratio >= 1.5x between adjacent rows before proceeding.

Open and read `{baseDir}/reference/visual-design.md` for palettes, font pairings, and visual element rules.

### Phase 3 — Build

Single-script `build.py` (see morph-ppt Phase 3 for template + checkpoint pattern).

Key differences from 2D workflow:
- `helper("clone", ...)` valid for content-only slides, but **slides with models must not have cloned model3d elements**.
- Add 3D model fresh on every slide with the same `name` prop.
- `helper("ghost-section", OUTPUT, N)` after clone clears `!!actor-*` but leaves `!!model-*` alone.
- After `officecli close`, run post-processing. See `{baseDir}/reference/cross-client-postprocess.md`.

### Phase 4 — Verification

Standard morph verification plus:
- Each slide has exactly one `model3d` element with matching `name`
- Adjacent slides have model area ratio >= 1.5x
- No two consecutive slides use the same layout pattern
- Fallback images replaced (not 1x1 gray). See `{baseDir}/reference/cross-client-postprocess.md` for verification steps.

---

## Deliverables — 4 files + preview PNGs

- `.glb` model file
- Output `.pptx` (with fallback images replaced)
- `build.py` (re-runnable)
- `brief.md`
- `slide-N-preview.png` per 3D slide (generated during build)

No extras (`outline.md`, `quality-report.md`, etc.). Planning in `brief.md`; verification to stdout.
