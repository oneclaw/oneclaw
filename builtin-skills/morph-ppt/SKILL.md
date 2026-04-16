---
name: morph-ppt
description: "使用 Morph 动画生成精美 PPT，支持从零创建或编辑已有文件"
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

# Morph

Generate visually compelling PPTs with smooth Morph animations.

## Use when

Activate this skill when the user's intent matches any of the following:

| Intent | Example expressions |
|--------|-------------------|
| Create a new PPT / 从零生成 PPT | "make me a pptx", "帮我做个PPT", "生成一个演示文稿", "写一份汇报PPT", "做个幻灯片" |
| Modify an existing PPT / 编辑已有文件 | "改一下这个PPT", "update this pptx", "把第三页的标题换掉", "调整一下配色" |
| Add animations / 加动画效果 | "加点动画", "add morph transitions", "让PPT动起来", "加过渡效果" |
| Content → PPT conversion / 内容转PPT | "把这篇文章做成PPT", "用这个大纲生成演示文稿", "根据这个内容出一套slides" |
| PPT review & polish / 优化美化 | "帮我美化一下", "排版太丑了", "polish this deck", "让它更专业" |

**Intent parsing rules:**

1. **File extension signal**: Any mention of `.pptx`, `PPT`, `slides`, `deck`, `演示文稿`, `幻灯片` strongly indicates this skill
2. **Action verbs**: 做/写/生成/创建/制作/出 + presentation-related noun → create intent
3. **Modification verbs**: 改/换/调/修/更新/优化/美化 + existing file → edit intent
4. **Implicit intent**: "帮我汇报一下XX" or "我要在周五展示XX" implies PPT creation when no other format is specified — ask to confirm
5. **Negative signals**: Do NOT activate for pure document/Word requests ("写个文档"), spreadsheet requests ("做个表格"), or image-only requests ("画张图")

## What is Morph?

PowerPoint Morph creates smooth animations by matching shapes with **identical names** across adjacent slides. Three core concepts:

- **Scene Actors** -- persistent shapes with `!!` prefix that evolve across slides (move, resize, recolor)
- **Ghosting** -- move shapes to `x=36cm` (off-screen) instead of deleting them
- **Content** -- per-slide text/data named `#sN-*`; previous content is auto-ghosted on clone

For deeper design principles: `{baseDir}/reference/pptx-design.md`.

---

## Workflow

### Phase 1: Understand the Topic

Ask only when the topic is unclear; otherwise proceed directly.

### Phase 2: Plan the Story

**FIRST: Read the thinking framework**

→ Open and read `{baseDir}/reference/decision-rules.md` -- it provides the structured approach for planning compelling presentations (Pyramid Principle, SCQA, page types).

**Then create `brief.md`** with:

- **Context**: Topic, audience, purpose, narrative structure (SCQA or Problem-Solution)
- **Outline**: Conclusion first + slide-by-slide summary
- **Page briefs**: For each slide -- objective, content, page type (title | evidence | transition | conclusion), design notes

**Morph Pair Scene Planning (REQUIRED before building)**

For every morph transition, plan the slide pair BEFORE writing any code:

| Pair | Slide A (start) | Slide B (end) | Visual narrative purpose |
|------|-----------------|---------------|--------------------------|
| 1→2  | Ring centered, title appears | Ring shifts right, subtitle revealed | Attention → context |
| 2→3  | Feature box large | Feature box small, metric card grows | Zoom out → detail |

**Rules for the planning table:**
- Determine ALL `!!` shape names during planning -- the same name must be used identically across the slide pair
- For each `!!` shape, decide its role: `!!scene-{desc}` (background/decoration) or `!!actor-{desc}` (content/foreground)
- Mark which shapes need to be ghosted at each section transition
- Do NOT start building until the naming table is complete -- renaming shapes mid-build causes ghost accumulation bugs

---

### Phase 3: Design and Generate

**Single-script execution (MANDATORY).** Write the entire deck build as ONE complete `build.py` and run it with a single `python3 build.py`. The script must be self-contained: create → open → build all slides with `checkpoint()` saves → close → `final-check`.

→ Copy and adapt `{baseDir}/reference/build-template.py` as your starter template.

- Do NOT issue individual `officecli` commands as separate tool calls -- per-call scheduling overhead compounds into timeout risk.
- **On failure, RE-RUN the same script -- do NOT rewrite it.** `checkpoint()` keeps completed slides on disk; a re-run is idempotent. Only edit a line when you can point to a specific error on it.
- **No alternative approaches.** One Python script using the template -- run, diagnose, fix that one line.

**Exec timeout contract.** `exec` defaults to **1800s (30 min)** -- plenty. Do NOT pass a shorter `timeout`; passing `timeout: 120` SIGTERMs the build mid-way. After `yieldMs` (~10s) exec returns `"Command still running"` -- poll via `process({ "action": "poll", "sessionId": "<session>", "timeout": 60000 })` until exit.

**Before generation, warn the user:** The PPT file may be rewritten multiple times during build. Do **not** open the PPT during generation -- file lock / write conflict risk.

**officecli is already bundled.** No install step needed.

**Use `{baseDir}/reference/morph-helpers.py`** -- it provides cross-platform helpers with built-in verification (auto-ghost on clone, section clearing, morph verification).

**Shape naming rules (load-bearing -- auto-ghost depends on them).**

Every shape falls into exactly one of these buckets:

| Prefix | Role | Lifecycle |
|--------|------|-----------|
| `!!scene-{desc}` | Background / decoration (e.g. `!!scene-ring`, `!!scene-bg-gradient`) | Persist entire deck. Move for motion, rarely ghost. |
| `!!actor-{desc}` | Content / foreground shapes (e.g. `!!actor-feature-box`, `!!actor-metric`) | Ghost at section boundaries via `helper("ghost-section", ...)`. |
| `#sN-{desc}` | Per-slide content (title, body, card). `N` = current slide number. | Auto-ghosted by `helper("clone", ...)` on the next slide. |

**Hard rules:**

1. **Every per-slide content shape MUST be named `#sN-<desc>`** with `N` = the slide number it first appears on. Without this prefix, `helper("clone", ...)` cannot find it to auto-ghost, and it will leak onto the next slide as visible residue. This is the #1 cause of "slide A content still shows on slide B."
2. **`!!scene-*` and `!!actor-*` names must NEVER collide.** Bad: `!!scene-card` + `!!actor-card`. Good: `!!scene-card-bg` + `!!actor-card-content`.
3. **Every `!!actor-*` shape needs a planned exit** -- either a permanent ghost to `x=36cm` on a specific slide, or section-wide clearing via `helper("ghost-section", ...)`. Plan exits in the Phase 2 morph-pair table.
4. **Ghost accumulation is silent.** A `!!actor-*` introduced on slide 3 remains visible on slides 4, 5, 6... until explicitly moved off-screen. Screenshot verification in Phase 4 is required to catch the long tail.

**Helper command cheat sheet:**

| When | Call | What it does |
|------|------|--------------|
| Every new slide after slide 1 | `helper("clone", OUTPUT, N, N+1)` | Clone + set `transition=morph` + auto-ghost every `#sN-*` by name |
| First slide of a new section | add `helper("ghost-section", OUTPUT, N+1)` right after `clone` | Ghost every `!!actor-*` to `x=36cm`; leaves `!!scene-*` alone |
| One-off scene-actor exit mid-section | `helper("ghost", OUTPUT, N, idx)` | Ghost specific shape indices -- escape hatch, rarely needed |
| Per-slide sanity check | `helper("verify", OUTPUT, N)` | Check transition + unghosted content + duplicate text across adjacent slides |
| End of build | `helper("final-check", OUTPUT)` | Run `verify` on every slide from 2..N |

**Do NOT call `helper("ghost", ...)` for `#sN-*` content.** `clone` already handles that by name.

**Scene Actor Spatial Rule (CRITICAL).** `!!scene-*` shapes must stay in **safe zones** -- corners and edges only. They must never cross or rest in the content area (`x=2~28cm, y=3~16cm`).

```
Safe zones:
  Top-right:      x >= 24cm, y <= 6cm
  Bottom-right:   x >= 24cm, y >= 12cm
  Bottom-left:    x <= 2cm,  y >= 12cm
  Off-screen:     x >= 32cm  (use for ghost position)
```

Before placing a scene actor, run `officecli get deck.pptx '/slide[N]' --depth 1 --json` and confirm the target box does not overlap any content shape.

**Typography:** 16pt minimum for primary content. Centered titles (64-72pt): use 28-30cm width. Spatial variety -- adjacent slides should differ in layout. Full guidelines in `{baseDir}/reference/pptx-design.md`.

**Design resources:**

- `{baseDir}/reference/pptx-design.md` -- Design principles (Canvas, Fonts, Colors, Scene Actors, Page Types, Choreography)
- `{baseDir}/reference/officecli-pptx-min.md` -- Command syntax
- `{baseDir}/reference/styles/INDEX.md` -- Visual style examples organized by use case

---

### Phase 4: Visual Verification + Deliver

Visual verification is REQUIRED -- `final-check` passing is necessary but not sufficient.

**4A. Structural check (CLI).** The build script already calls `helper("verify", ...)` per slide and `helper("final-check", ...)` at the end. Also run:

```bash
officecli validate <file>.pptx
officecli view <file>.pptx outline
```

**4B. Screenshot check (MANDATORY).** `final-check` covers `#sN-` ghosting and cross-slide duplicate detection, but **cannot** detect:
- `!!scene-*` shapes that have drifted into the content area
- Stale `!!actor-*` shapes that survived at a visible `x`
- Scene-actor positions that don't change between adjacent slides (static "animation")

Capture one image per slide and eyeball it:

```bash
# Option 1: SVG preview
officecli view deck.pptx svg --output-dir screenshots/

# Option 2: LibreOffice -> PDF -> screenshots (higher fidelity)
libreoffice --headless --convert-to pdf deck.pptx
```

Per-slide checklist:
- [ ] No previous section's `!!actor-*` visible (should all be at `x >= 33.87cm`).
- [ ] On each section's opening slide, every prior-section actor is cleared.
- [ ] Final slide is clean -- no leftover shapes from earlier sections.
- [ ] Decorative `!!scene-*` shapes are in their intended positions.

If verification fails, see `{baseDir}/reference/troubleshooting.md`.

---

**Outputs** (3 files):

1. `<topic>.pptx`
2. Build script (complete, re-runnable)
3. `brief.md` -- **MUST be a standalone file** (not embedded inside test-report.md or any other file).
   Content: slide-by-slide plan, content per slide, morph design decisions, ghost strategy per transition.

**Final delivery message requirements:**

- Tell the user the deck with polished Morph animations is ready.
- Explicitly recommend opening the generated PPT now to preview the motion effects.
- **Return the `brief.md` file path** so the user can preview the slide plan and design decisions.

---

### Phase 5: Iterate

Ask user for feedback, support quick adjustments. For post-build edits: `{baseDir}/reference/troubleshooting.md`.

---

## References

- `{baseDir}/reference/decision-rules.md` -- Planning logic, Pyramid Principle
- `{baseDir}/reference/build-template.py` -- Build script starter template
- `{baseDir}/reference/pptx-design.md` -- Design principles (Canvas, Fonts, Colors, Scene Actors, Page Types, Choreography)
- `{baseDir}/reference/officecli-pptx-min.md` -- Tool syntax
- `{baseDir}/reference/quality-gates.md` -- Content and layout quality checks
- `{baseDir}/reference/troubleshooting.md` -- Common issues and post-build adjustments
- `{baseDir}/reference/styles/INDEX.md` -- Visual style examples organized by use case
