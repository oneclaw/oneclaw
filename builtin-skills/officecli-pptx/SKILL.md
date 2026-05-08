---
name: officecli-pptx
description: "Use this skill any time a .pptx file is involved -- as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file; editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions 'deck,' 'slides,' 'presentation,' or references a .pptx filename. Drive bulk edits through JSON batch payloads handed to officecli batch (--input); never write Python / Node / Ruby (or other interpreted-language) helper scripts to generate the JSON or wrap CLI calls."
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

> ## STOP — READ THIS FIRST (Windows PowerShell Compatibility)
>
> Every command in this skill must be a **single line** of plain `officecli ...` argv, OR routed through a JSON file via `officecli batch <file> --input batch.json`. Nothing else is portable.
>
> **NEVER use any of these — they break on Windows PowerShell:**
>
> 1. **Backslash `\` line continuation** — PowerShell does not recognize it, throws `InvalidEndOfLine`. Do NOT recommend the PowerShell backtick `` ` `` either; instead, write the command on one line, or use `--input batch.json`.
> 2. **Here-documents** — `cat <<'EOF' ... EOF | officecli batch ...` is bash-only, fails in PowerShell and Windows cmd.
> 3. **Piping JSON into stdin** — `echo '...' | officecli batch ...`, `Write-Output ... | ...`, `Get-Content ... |`. Always pass JSON via `--input <file>`.
> 4. **Shell text utilities** — `awk`, `sed`, `printf`, `tr`, `while read`. Not portable.
> 5. **Helper scripts in interpreted languages** — Python / Node / Ruby / shell loops to generate the batch JSON or wrap `officecli`. Forbidden.
>
> **For any command with 3+ `--prop` flags, or any raw XML payload:** use the `Write` tool to author `batch.json`, then run `officecli batch <file.pptx> --input batch.json`. This is the only path that works identically on macOS Terminal, Windows cmd, and Windows PowerShell.
>
> If you are about to type `\` at the end of a line, stop and rewrite the command as a single line or as a JSON batch.

## BEFORE YOU START (CRITICAL)

> [!CAUTION]
> **zsh users (default shell on macOS)**: any path argument containing brackets **must be quoted**, or zsh glob-expands it and fails with `zsh: no matches found`.
> - Correct: `officecli set deck.pptx '/slide[1]'` or `"/slide[1]"`
> - Wrong: `officecli set deck.pptx /slide[1]` (zsh expands `[1]`)
>
> **This is the most common first-use failure.** Verify quoting works:
> ```bash
> officecli get deck.pptx '/slide[1]' --depth 1   # correct (quoted)
> ```
> If you see `no matches found`, quotes are missing.

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

**Note: `view outline` does not count tables or charts** — slides containing tables/charts show as "1 text box(es)", so the shape count is understated. For a full structural listing (including table dimensions and chart types), use:
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

- **H4 — Body text minimum 16pt, no exceptions.** Card body, multi-column content, and bullet points must all be ≥ 16pt. "Content doesn't fit" is not a reason to drop below 16pt — reduce text, split the slide, or remove cards. Only these non-primary elements may be < 16pt: chart axis labels, legends, footnotes, KPI sublabels (≤5-word captions, e.g. "Active users", "MoM growth").
- **H6 — Dark background contrast.** When the slide background is dark (luminance < 30%), all text must use white (`FFFFFF`) or near-white (luminance > 80%). Never use neutral gray or low-saturation tones as body text on dark backgrounds.
- **H7 — Speaker notes required.** All content slides (non-cover, non-closing) must include speaker notes. A content slide missing notes is a hard delivery failure.

**Visual element checkpoint:** at least 1 of every 3 content slides must include a non-text visual element (color block / shape / chart). Text-only slides are allowed only for quotes, code examples, or pure tables.

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

> **Note: `view text` does not extract text inside tables.** To verify table content, use `officecli get deck.pptx '/slide[N]/table[M]' --json`.

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
| `\n`/`\\` in shell strings & code slides | Plain text shape: use `\\n` for a line break, e.g. `--prop text="line1\\nline2"`.<br>**For code slides**: `--prop text="kubectl apply \\n  -f pod.yaml"` renders the literal `\\n` (not a line break). For code content, use a single `\n` for a real line break: `--prop text="line1\nline2"`. Note that in shell single-quoted strings `\n` is literal — prefer a JSON batch (`--input batch.json`) to pass multiline code and avoid shell-escape issues. |
| `EBUSY: resource busy or locked` | A viewer (PowerPoint / WPS / Explorer preview), cloud sync (OneDrive/Dropbox/iCloud), antivirus, or a stale resident daemon is holding the file. Full runbook: [reference/known-issues.md](reference/known-issues.md#ebusy-resource-busy-or-locked). |
| Hex colors with `#` | Use `FF0000` not `#FF0000` -- no hash prefix |
| Theme colors | Use `accent1`..`accent6`, `dk1`, `dk2`, `lt1`, `lt2` -- not hex |
| Forgetting alt text | Always set `--prop alt="description"` on pictures for accessibility |
| Paths are 1-based | `/slide[1]`, `/shape[1]` -- XPath convention |
| `--index` is 0-based | `--index 0` = first position -- array convention |
| Z-order (shapes overlapping) | Use `--prop zorder=back` or `zorder=front` / `forward` / `backward` / absolute position number. **WARNING:** Z-order changes cause shape index renumbering -- re-query with `get --depth 1` after any z-order change before referencing shapes by index. Process highest index first when changing multiple shapes. |
| `gap`/`gapwidth` on chart add | Ignored during `add` -- set it after creation: `officecli set ... /slide[N]/chart[M] --prop gap=80` |
| `$` in `--prop text=` (shell) | `--prop text="$15M"` strips the value — shell expands `$15` as a variable. Use single quotes: `--prop text='$15M'`. For multiline or mixed quotes, use a JSON batch file. |
| `$` and `'` in batch JSON text | Author the batch with the `Write` tool (`batch.json`) and run `officecli batch <file.pptx> --input batch.json`. The JSON file is read directly, so shell quoting/expansion never touches the payload. |
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

Batch is a separate, independent mechanism — use it to collapse many operations into one API call. **Always author the JSON with the `Write` tool, then pass it via `--input`** — this is the only path that works identically on macOS Terminal, Windows cmd, and Windows PowerShell.

1. Use the `Write` tool to create `batch.json`:

```json
[
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Title","x":"2cm","y":"2cm","width":"20cm","height":"3cm","size":"36","bold":"true"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"Body text","x":"2cm","y":"6cm","width":"20cm","height":"10cm","size":"16"}}
]
```

2. Run the batch:

```bash
officecli batch slides.pptx --input batch.json
```

> Note: in batch mode, JSON path fields (e.g. `"/slide[1]"`) live inside the JSON file, so shell glob/quoting rules never apply. For non-batch direct commands, `/slide[1]` still must be quoted on the shell, or zsh will error out.

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `view`, `raw`, `raw-set`, `validate`.

**Batch and resident mode are independent — but do NOT combine them on the same file.** Each improves performance on its own; running `batch <file>` while a resident daemon still holds `<file>` races with the daemon's write handle and triggers `EBUSY: resource busy or locked` (see [reference/known-issues.md](reference/known-issues.md#ebusy-resource-busy-or-locked)). If you opened the file with `officecli open`, end the resident session with `officecli close <file>` **before** any `officecli batch <file> --input ...` invocation.

**Do not** generate batch JSON or wrap `officecli` calls with Python / Node / Ruby (or any other interpreted-language) helper scripts. Author the JSON with the `Write` tool and invoke `officecli batch <file> --input batch.json` in the same observed step. Runtime-generated payloads hide the ops from review, depend on an interpreter the host may not have, and defeat the small-chunk checkpoint discipline above.

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
