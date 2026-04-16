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

---

## Hard Rules — read BEFORE doing anything else

1. **Exec format.** Run the build script with a plain direct command. The script calls `os.chdir()` internally — no shell `cd` needed.

   ```
   CORRECT:  python3 /absolute/path/to/build.py
   WRONG:    cd /some/dir && python3 build.py      ← REJECTED by exec preflight
   WRONG:    bash -c "python3 build.py"             ← REJECTED
   ```

2. **Never `edit` the build script.** It contains hundreds of identical `"--prop"` fragments; `edit` requires a unique match and will always fail. Use `write` to rewrite the entire file when changes are needed.

3. **On failure, re-run the same script.** `checkpoint()` flushes completed slides to disk; re-running is idempotent. Do NOT rewrite the script on first failure — diagnose, fix the one broken line with `write`, re-run.

4. **Exec timeout.** Defaults to **1800s** — do NOT pass a shorter `timeout`. After `yieldMs` (~10s), exec returns `"Command still running"` — poll via `process({"action":"poll","sessionId":"<id>","timeout":60000})`.

5. **Warn the user** not to open the PPT during generation — file lock risk.

6. **officecli is bundled.** No install step needed.

---

## What is Morph?

PowerPoint Morph animates shapes by matching **identical names** across adjacent slides. Three concepts: **Scene Actors** (`!!scene-*`, persistent decoration), **Ghosting** (move to `x=36cm` instead of deleting), **Content** (`#sN-*`, auto-ghosted on clone). Details: `{baseDir}/reference/pptx-design.md`.

---

## Workflow

### Phase 1: Understand the Topic

Ask only when the topic is unclear; otherwise proceed directly.

### Phase 2: Plan the Story

→ Read `{baseDir}/reference/decision-rules.md` for the planning framework (Pyramid Principle, narrative structures, morph pair table format).

Create `brief.md` with:
- **Summary**: Topic, audience, purpose, narrative structure, style direction
- **Outline**: Conclusion first + slide-by-slide summary with page types
- **Page briefs**: Per slide — objective, content, page type, hierarchy, transition
- **Morph pair table**: Plan ALL `!!` shape names and their roles before building (format in decision-rules.md)

### Phase 3: Build

**Single-script execution.** Write the entire deck as ONE `build.py` and run it once. Do NOT issue individual `officecli` commands as separate tool calls — per-call scheduling overhead compounds into timeout risk.

→ Copy and adapt `{baseDir}/reference/build-template.py`. The template docstring contains all shape naming rules, helper commands, and critical constraints — read it carefully before adapting.

→ Use `{baseDir}/reference/morph-helpers.py` for clone/ghost/verify operations.

**Scene actor safe zones.** `!!scene-*` shapes must stay in corners and edges — never in the content area (`x=2~28cm, y=3~16cm`).

```
Safe zones: top-right (x>=24, y<=6), bottom-right (x>=24, y>=12),
            bottom-left (x<=2, y>=12), off-screen (x>=32)
```

**Typography:** 16pt minimum. Centered titles (64-72pt): use 28-30cm width.

**Design resources:**
- `{baseDir}/reference/pptx-design.md` — Design principles
- `{baseDir}/reference/officecli-pptx-min.md` — Command syntax
- `{baseDir}/reference/styles/INDEX.md` — Visual style examples

### Phase 4: Verify + Deliver

The build script calls `helper("verify", ...)` per slide and `helper("final-check", ...)` at the end. Additionally run:

```bash
officecli validate <file>.pptx
officecli view <file>.pptx outline
```

**Screenshot check (MANDATORY)** — `final-check` cannot detect scene actors in the content area or stale actors at visible positions:

```bash
officecli view deck.pptx svg --output-dir screenshots/
```

Per-slide checklist:
- No previous section's `!!actor-*` visible
- Decorative `!!scene-*` in intended positions, not in content area
- Final slide clean — no leftover shapes

If verification fails: `{baseDir}/reference/troubleshooting.md`.

---

**Outputs** (3 files):

1. `<topic>.pptx`
2. Build script (complete, re-runnable)
3. `brief.md` — **standalone file**, not embedded in other files. Content: slide plan, morph design decisions, ghost strategy.

**Delivery:** Tell the user the deck is ready, recommend opening it to preview morph effects, return the `brief.md` path.

---

### Phase 5: Iterate

Ask for feedback, support quick adjustments. Post-build edits: `{baseDir}/reference/troubleshooting.md`.

---

## References

- `{baseDir}/reference/decision-rules.md` — Planning logic, Pyramid Principle, morph pair table
- `{baseDir}/reference/build-template.py` — Build script template (includes naming rules + helper cheat sheet)
- `{baseDir}/reference/pptx-design.md` — Design principles (Canvas, Fonts, Colors, Scene Actors, Page Types)
- `{baseDir}/reference/officecli-pptx-min.md` — Tool syntax
- `{baseDir}/reference/quality-gates.md` — Content and layout quality checks
- `{baseDir}/reference/troubleshooting.md` — Common issues and post-build adjustments
- `{baseDir}/reference/styles/INDEX.md` — Visual style examples organized by use case
