---
name: officecli-pptx
description: "Use this skill any time a .pptx file is involved -- as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file; editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions 'deck,' 'slides,' 'presentation,' or references a .pptx filename."
metadata:
  {
    "openclaw":
      {
        "emoji": "📊",
        "os": ["darwin", "linux", "win32"],
        "requires": { "bins": ["officecli"] },
      },
  }
---

# OfficeCLI PPTX Skill

## BEFORE YOU START (CRITICAL)

> [!CAUTION]
> **zsh 用户（macOS 默认 shell）**：所有含方括号的路径参数**必须加引号**，否则 zsh 会 glob 展开并报错 `zsh: no matches found`。
> - 正确：`officecli set deck.pptx '/slide[1]'` 或 `"/slide[1]"`
> - 错误：`officecli set deck.pptx /slide[1]`（zsh 会展开 `[1]`）
>
> **这是首次使用时几乎必然触发的错误。** 验证引号是否生效：
> ```bash
> officecli get deck.pptx '/slide[1]' --depth 1   # 正确（有引号）
> ```
> 如果看到 `no matches found`，说明引号缺失。

**officecli is pre-installed.** Verify: `officecli --version`

---

## Quick Reference

| Task | Action |
|------|--------|
| Read / analyze content | Use `view` and `get` commands below |
| Create from scratch | Read [creating.md](creating.md) |
| Edit existing presentation | Read [editing.md](editing.md) |
| Design guidance (colors, fonts, layout) | Read [reference/design-guide.md](reference/design-guide.md) |
| QA & delivery checklist | Read [reference/qa-checklist.md](reference/qa-checklist.md) |
| Fix common visual issues | Read [reference/recipes.md](reference/recipes.md) |
| Known issues & workarounds | Read [reference/known-issues.md](reference/known-issues.md) |

---

## Execution Model

**Use interactive checkpoints. For repetitive edits, prefer small `officecli batch` chunks instead of hundreds of separate tool calls. Do not write an unobserved shell script and execute it as a single block.**

OfficeCLI is incremental: every `add`, `set`, and `remove` immediately modifies the file and returns output. Use this to catch errors early:

1. **Structural or risky operation: one command, then read the output.** Check the exit code before proceeding.
2. **Repetitive low-risk edits: use `officecli batch` in small chunks (8-12 ops).** Read the batch output before the next chunk.
3. **Non-zero exit = stop and fix immediately.** Do not continue building on a broken state.
4. **Verify after structural operations.** After adding a slide, chart, table, or animation, run `get` or `validate` before building on top of it.

Running a 50-command script all at once means the first error cascades silently through every subsequent command. Small observed batch chunks keep failure context local while avoiding unnecessary tool turns.

---

## Reading & Analyzing

### Text Extraction

```bash
officecli view slides.pptx text
officecli view slides.pptx text --start 1 --end 5
```

### Structure Overview

```bash
officecli view slides.pptx outline
```

Output shows slide titles, shape counts, and picture counts per slide.

**注意：`view outline` 不计入表格和图表**——含表格/图表的 slide 显示为 "1 text box(es)"，shape count 偏低。如需完整结构清单（含表格行列数和图表类型），请使用：
```bash
officecli view slides.pptx annotated
```

### Detailed Inspection

```bash
officecli view slides.pptx annotated
```

Shows shape types, fonts, sizes, pictures with alt text status, tables with dimensions.

### Statistics

```bash
officecli view slides.pptx stats
```

Slide count, shape count, font usage, missing titles, missing alt text.

### Element Inspection

```bash
# List all shapes on a slide
officecli get slides.pptx /slide[1] --depth 1

# Get shape details (position, fill, font, animation, etc.)
officecli get slides.pptx /slide[1]/shape[1]

# Get chart data and config
officecli get slides.pptx /slide[1]/chart[1]

# Get table structure
officecli get slides.pptx /slide[1]/table[1] --depth 3

# Get placeholder by type
officecli get slides.pptx "/slide[1]/placeholder[title]"
```

### CSS-like Queries

```bash
# Find shapes containing specific text
officecli query slides.pptx 'shape:contains("Revenue")'

# Find pictures without alt text
officecli query slides.pptx "picture:no-alt"

# Find shapes with specific fill color
officecli query slides.pptx 'shape[fill=#4472C4]'

# Find shapes wider than 10cm
officecli query slides.pptx "shape[width>=10cm]"

# Find shapes on a specific slide
officecli query slides.pptx 'slide[2] > shape[font="Arial"]'
```

### Visual Inspection

```bash
# SVG rendering (single slide, self-contained, no dependencies)
officecli view slides.pptx svg --start 1 --end 1 --browser

# HTML rendering (all slides, interactive, with charts and 3D -- recommended)
officecli view slides.pptx html --browser
```

**Note:** SVG renders only one slide per invocation (the first in the range). Use `html --browser` for multi-slide preview with full chart/gradient/table rendering.

---

## Design Principles (Summary)

**Don't create boring slides.** Plain bullets on a white background won't impress anyone. Pick a bold, content-informed color palette, commit to a visual motif, and vary layouts across slides.

**Hard rules:**

- **H4 — Body text minimum 16pt, no exceptions.** 卡片内正文、多列内容、bullet points 一律不低于 16pt。「内容放不下」不是低于 16pt 的理由——应减少文字、拆分 slide，或减少卡片数量。仅以下非主读元素允许 < 16pt：图表轴标签、图例、脚注、KPI sublabel（≤5 词的短标注，如 "Active users"、"MoM growth"）。
- **H6 — Dark background contrast.** 当 slide 背景为深色（亮度 < 30%）时，所有文字必须使用白色（`FFFFFF`）或近白色（亮度 > 80%）。严禁在深色背景上使用中性灰或低饱和色调作为 body text。
- **H7 — Speaker notes required.** 所有内容 slide（非封面、非结尾）必须包含 speaker notes。缺少 notes 的内容 slide 是交付硬性失败项。

**Visual element checkpoint:** 每 3 张 content slide 中，至少 1 张必须包含非文字视觉元素（色块/图形/图表）。纯文字 slide 仅允许在引用、代码示例、纯表格场景使用。

**Never use accent lines under titles** — these are a hallmark of AI-generated slides; use whitespace or background color instead.

Full design guidance including color palettes, typography, and layout patterns: [reference/design-guide.md](reference/design-guide.md)

---

## QA (Summary)

**Assume there are problems. Your job is to find them.**

Essential checks:

```bash
officecli view slides.pptx text          # Content check
officecli view slides.pptx issues        # Structural issues
officecli validate slides.pptx           # Schema validation
officecli view slides.pptx html --browser  # Visual inspection
```

> **注意：`view text` 不提取表格内的文本。** 如需验证表格内容，请使用 `officecli get deck.pptx '/slide[N]/table[M]' --json`。

> **`view issues` "Slide has no title"** warnings are expected and safe to ignore when using `layout=blank`.

Always run at least one fix-and-verify cycle: generate → inspect → list issues → fix → re-verify. One fix often creates another problem. Use subagents for visual QA — fresh eyes catch issues you will miss after staring at code.

Full QA procedures and pre-delivery checklist: [reference/qa-checklist.md](reference/qa-checklist.md)

---

## Common Pitfalls

| Pitfall | Correct Approach |
|---------|-----------------|
| ⚠️ Unquoted `[N]` in zsh/bash | Shell glob-expands `/slide[1]` and throws `no matches found`. **Always quote paths**: `"/slide[1]"` or `'/slide[1]'`. This is the #1 first-use stumbling block on zsh. |
| `--name "foo"` | Use `--prop name="foo"` -- all attributes go through `--prop` |
| `x=-3cm` | Negative coordinates **are supported** and can be used for bleed effects (e.g., `x=-2cm` lets a decorative element overflow the left edge). |
| `/shape[myname]` | Name indexing not supported. Use numeric index: `/shape[3]` |
| Guessing property names | Run `officecli pptx set shape` to see exact names |
| `\n`/`\\` in shell strings & code slides | 普通文本 shape：使用 `\\n` 表示换行，如 `--prop text="line1\\nline2"`。<br>**代码 slide 特别注意**：`--prop text="kubectl apply \\n  -f pod.yaml"` 会在 slide 上显示字面量 `\\n`（而非换行）。对于演示用代码内容，使用单个 `\n` 实现真实换行：`--prop text="line1\nline2"`。但在 shell 单引号字符串中 `\n` 是字面量；建议使用 heredoc 或 JSON batch 传递带换行的代码文本，以避免 shell 转义问题。 |
| Modifying an open file | Close the file in PowerPoint/WPS first |
| Hex colors with `#` | Use `FF0000` not `#FF0000` -- no hash prefix |
| Theme colors | Use `accent1`..`accent6`, `dk1`, `dk2`, `lt1`, `lt2` -- not hex |
| Forgetting alt text | Always set `--prop alt="description"` on pictures for accessibility |
| Paths are 1-based | `/slide[1]`, `/shape[1]` -- XPath convention |
| `--index` is 0-based | `--index 0` = first position -- array convention |
| Z-order (shapes overlapping) | Use `--prop zorder=back` or `zorder=front` / `forward` / `backward` / absolute position number. **WARNING:** Z-order changes cause shape index renumbering -- re-query with `get --depth 1` after any z-order change before referencing shapes by index. Process highest index first when changing multiple shapes. |
| `gap`/`gapwidth` on chart add | Ignored during `add` -- set it after creation: `officecli set ... /slide[N]/chart[M] --prop gap=80` |
| `$` in `--prop text=` (shell) | `--prop text="$15M"` strips the value — shell expands `$15` as a variable. Use single quotes: `--prop text='$15M'`. For multiline or mixed quotes, use heredoc batch. |
| `$` and `'` in batch JSON text | Use heredoc: `cat <<'EOF' \| officecli batch` -- single-quoted delimiter prevents shell expansion of `$`, apostrophes, and backticks |
| Template text at wrong size | Template shapes have baked-in font sizes. Always include `size`, `font`, and `color` in every `set` on template shapes. See editing.md "Font Cascade from Template Shapes" section. |

---

## Performance: Resident Mode

**Always use `open`/`close` — it is the smart default, not a special-case optimization.** Every command benefits: no repeated file I/O, no repeated parse/serialize cycles.

```bash
officecli open slides.pptx        # Load once into memory
officecli add slides.pptx ...     # All commands run in memory — fast
officecli set slides.pptx ...
officecli close slides.pptx       # Write once to disk
```

Use this pattern for every presentation build, regardless of command count.

## Performance: Batch Mode

Batch is a separate, independent mechanism — use it to collapse many operations into one API call:

```bash
# ⚠️ zsh 注意：batch 模式中 JSON path 字段（如 "/slide[1]"）已包含引号，无需额外处理。
# 但在非 batch 的直接命令中，路径参数 /slide[1] 必须加引号，否则 zsh 报错。
cat <<'EOF' | officecli batch slides.pptx
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Title","x":"2cm","y":"2cm","width":"20cm","height":"3cm","size":"36","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Body text","x":"2cm","y":"6cm","width":"20cm","height":"10cm","size":"16"}}
]
EOF
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `view`, `raw`, `raw-set`, `validate`.

**Batch and resident mode are independent.** Each improves performance on its own. They can be combined, but batch alone (without `open`) already handles the file I/O in one cycle per batch call.

Batch fields: `command`, `path`, `parent`, `type`, `from`, `to`, `index`, `after`, `before`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

`parent` = container to add into (for `add`, including clone via `from` field). `path` = element to modify (for `set`, `get`, `remove`, `move`, `swap`).

---

## Help System

**When unsure about property names, value formats, or command syntax, run help instead of guessing.** One help query is faster than guess-fail-retry loops.

```bash
officecli pptx set              # All settable elements and their properties
officecli pptx set shape        # Shape properties in detail
officecli pptx set shape.fill   # Specific property format and examples
officecli pptx add              # All addable element types
officecli pptx view             # All view modes
officecli pptx get              # All navigable paths
officecli pptx query            # Query selector syntax
```
