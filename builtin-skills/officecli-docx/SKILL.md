---
name: officecli-docx
description: "Use this skill when a .docx file is involved — creating, reading, editing, or analyzing Word documents. Triggers on: 'Word doc', 'document', 'report', 'letter', 'memo', 'proposal', or any .docx filename."
---

# OfficeCLI DOCX Skill

## Install

`officecli` ships preinstalled with OneClaw. Verify with:

```
officecli --version
```

If the command is not found, the OneClaw installation is broken — please reinstall OneClaw.

---

## Cross-platform contract

This skill runs identically on macOS Terminal, Windows cmd, and Windows PowerShell because every command is a plain CLI invocation with no shell-specific syntax.

- All commands are `officecli <verb> <file> [args...]` — plain argv, never piped through shell interpreters.
- Bulk operations always go through a JSON file: use the `Write` tool to create `batch.json`, then call `officecli batch <file> --input batch.json`.
- No shell-only constructs allowed in this skill: no here-documents, no piping JSON into stdin, no text-processing utilities like `awk` / `sed` / `printf` / `while read`, no single-quote escape tricks.
- Path quoting: when a path contains spaces, wrap the whole path argument in double quotes (`"My File.docx"`) — works in all three shells. Inside batch JSON files, paths need no shell escaping (just JSON-escape `\` as `\\`).

---

## Quick Reference

| Task | Action |
|------|--------|
| Read / analyze content | Use view and get commands below |
| Edit existing document | Read [examples/editing.md](examples/editing.md) |
| Create from scratch | Read [examples/creating.md](examples/creating.md) |
| Command details | Read [reference/commands.md](reference/commands.md) |
| Known bugs | Read [reference/known-issues.md](reference/known-issues.md) |

---

## Execution Model

**Use interactive checkpoints. For repetitive edits, prefer small `officecli batch` chunks (driven by a batch JSON file passed via `--input`, not by inline shell tricks) instead of hundreds of separate tool calls.**

OfficeCLI is incremental — every command immediately modifies the file.

1. Structural or risky operation: run one command, then check output before proceeding.
2. Repetitive low-risk `add`/`set` operations: use `officecli batch` in chunks (default up to ~12 ops; pure content add can go higher), then read the batch output.
3. Non-zero exit = stop and fix immediately.
4. Verify after structural operations with `get` or `validate`.

**Always use resident mode:**

```bash
officecli open doc.docx           # Load into memory
officecli add doc.docx ...        # All commands run fast
officecli set doc.docx ...
officecli close doc.docx          # Write to disk
```

---

## Performance: Bulk Insert via Chunked Batches (fast path)

For repetitive `add`/`set` work, drive `officecli batch` from a JSON file. **This is the only recommended bulk path — it works identically on macOS, Windows cmd, and PowerShell.**

Recommended workflow:

1. Use the `Write` tool to create a batch JSON file in the working directory (e.g. `chunk-1.json`). The file content is a JSON array of ops.
2. Run `officecli batch doc.docx --input chunk-1.json`.
3. Read the output and confirm no errors. For more content, write `chunk-2.json` and repeat.

Example `chunk-1.json` (created via `Write`):

```json
[
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Executive Summary","style":"Heading1"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Quarterly results exceeded expectations across every region.","style":"Normal"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Revenue Growth","style":"Heading2"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Total revenue reached $5.1M, up 25% year-over-year.","style":"Normal"}},
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"季度业绩超出预期。","style":"Normal"}}
]
```

Then run:

```
officecli batch doc.docx --input chunk-1.json
```

Notes:

- All strings in the JSON file are UTF-8. Write CJK characters directly — no escaping needed beyond standard JSON rules.
- Default chunk size: ~50 ops per file. If a chunk fails, drop to 20 and retry.
- Apply heavy formatting (font, color, complex shading) afterward via targeted `set` calls to keep batch payloads small.
- **Do not** demonstrate or use here-documents, `cat`-pipe-stdin, text-processing utilities (`awk`/`sed`/`printf`), shell loops, or piping JSON into stdin. The only path is `Write` → `batch --input <file>`.

### Inline shortcut: `--commands`

For a tiny batch (a few ops, all-ASCII content) you can pass the JSON inline:

```
officecli batch doc.docx --commands "[{\"command\":\"add\",\"parent\":\"/body\",\"type\":\"paragraph\",\"props\":{\"text\":\"Hello\"}}]"
```

**Caveat:** inline JSON is still parsed by the shell, so `"`, `$`, `!`, and CJK characters can require platform-specific quoting. Use this only when the content is short and pure ASCII; otherwise always use `--input <file>`.

---

## Reading & Analyzing

```bash
# Text extraction
officecli view doc.docx text
officecli view doc.docx text --max-lines 200
officecli view doc.docx text --start 1 --end 50

# Structure overview (heading hierarchy, stats, headers/footers)
officecli view doc.docx outline

# Detailed formatting per run
officecli view doc.docx annotated

# Statistics (style/font distribution)
officecli view doc.docx stats

# Element inspection
officecli get doc.docx /                          # Document root
officecli get doc.docx /body --depth 1            # Body children
officecli get doc.docx "/body/p[1]"               # Specific paragraph
officecli get doc.docx "/body/tbl[1]" --depth 3   # Table structure
officecli get doc.docx /styles                    # Style definitions
officecli get doc.docx "/header[1]"               # Header content

# CSS-like queries
officecli query doc.docx 'paragraph[style=Heading1]'
officecli query doc.docx 'p:contains("quarterly")'
officecli query doc.docx 'p:empty'
officecli query doc.docx 'image:no-alt'
```

---

## Common Pitfalls

| Pitfall | Correct Approach |
|---------|-----------------|
| `--name "foo"` | Use `--prop name="foo"` — all attributes go through `--prop` |
| Guessing property names | Run `officecli docx set paragraph` to see exact names |
| `\n` in shell strings | Use `\\n`: `--prop text="line1\\nline2"` |
| Hex colors with `#` | Use `FF0000` not `#FF0000` |
| Paths are 1-based | `/body/p[1]`, `/body/tbl[1]` (XPath convention) |
| `--index` is 0-based | `--index 0` = first position (array convention) |
| `\` and `"` in batch JSON | JSON-escape: `\` becomes `\\`, `"` becomes `\"`. Same on every platform. |
| Empty paragraphs for spacing | Use `spaceBefore`/`spaceAfter` instead |
| Row-level bold/color/shd | Row `set` only supports `height`, `header`, `c1/c2/c3`. Use cell-level `set` for formatting |
| `--prop field=page` in footer | **Silently ignored.** Must use `raw-set` to inject PAGE field. See [reference/commands.md](reference/commands.md#headers--footers) |
| Section vs root property names | Section: lowercase (`pagewidth`). Root: camelCase (`pageWidth`) |
| Code block indent via spaces | Use `--prop ind.left=720` instead |

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

```bash
# Issue detection
officecli view doc.docx issues
officecli view doc.docx issues --type format
officecli view doc.docx issues --type content

# Content QA
officecli view doc.docx text
officecli view doc.docx outline
officecli query doc.docx 'p:empty'
officecli query doc.docx 'image:no-alt'

# Validation
officecli validate doc.docx
```

### Pre-Delivery Checklist

- [ ] Metadata set (title, author)
- [ ] Page numbers verified with `get "/footer[N]" --depth 3` (must show `fldChar`)
- [ ] TOC present when document has 3+ headings
- [ ] Cover page content fills >= 60% of the page
- [ ] Last page content fills >= 40% of the page
- [ ] Heading hierarchy correct (no skipped levels)
- [ ] No empty paragraphs used as spacing
- [ ] All images have alt text
- [ ] Tables have header rows
- [ ] `officecli validate` passes
- [ ] No placeholder text remaining

### Verification Loop

1. Generate document
2. Run `view issues` + `view outline` + `view text` + `validate`
3. Fix issues found
4. Re-verify — one fix often creates another problem
5. Repeat until clean

**QA display notes:**
- `view text` shows "1." for ALL numbered list items — this is a display limitation, not a defect.
- `view issues` flags "missing first-line indent" on cover paragraphs, centered headings, list items — these warnings are expected.
- No visual preview for docx. Use `view text`/`view annotated`/`view outline`/`view issues` for verification.

---

## Help System

```bash
officecli docx set              # All settable elements and properties
officecli docx set paragraph    # Paragraph properties
officecli docx set table        # Table properties
officecli docx add              # All addable element types
officecli docx view             # All view modes
officecli docx get              # All navigable paths
officecli docx query            # Query selector syntax
```

---

## Design Principles

- **Structure**: Every document needs clear hierarchy — title, headings, body. Don't create walls of unstyled Normal paragraphs.
- **Typography**: Readable body font (Calibri, Cambria) at 11-12pt. Headings: H1=18-20pt, H2=14pt bold, H3=12pt bold.
- **Spacing**: Use `spaceBefore`/`spaceAfter`, not empty paragraphs. Line spacing 1.15x-1.5x for body.
- **Page setup**: Always set margins explicitly. US Letter: `pageWidth=12240, pageHeight=15840`, margins=1440.
- **Tables**: Alternate row shading, header row with contrasting background.
- **Color**: Use sparingly — accent for headings/table headers only.

| Content Type | Recommended Element |
|---|---|
| Sequential items | Bulleted list (`listStyle=bullet`) |
| Step-by-step | Numbered list (`listStyle=numbered`) |
| Comparative data | Table with header row |
| Trend data | Chart (`chartType=line/column`) |
| Mathematical content | Equation (`formula=LaTeX`) |
| Citation/reference | Footnote or endnote |
