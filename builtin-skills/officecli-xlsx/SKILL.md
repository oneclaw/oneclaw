---
name: officecli-xlsx
description: "Use this skill any time a .xlsx file is involved -- as input, output, or both. This includes: creating spreadsheets, financial models, dashboards, or trackers; reading, parsing, or extracting data from any .xlsx file; editing, modifying, or updating existing workbooks; working with formulas, charts, pivot tables, or templates; importing CSV/TSV data into Excel format. Trigger whenever the user mentions 'spreadsheet', 'workbook', 'Excel', 'financial model', 'tracker', 'dashboard', or references a .xlsx/.csv filename."
metadata:
  {
    "openclaw":
      {
        "emoji": "📈",
        "os": ["darwin", "linux", "win32"],
        "requires": { "bins": ["officecli"] },
      },
  }
---

# OfficeCLI XLSX Skill

## BEFORE YOU START (CRITICAL)

**officecli is pre-installed.** Verify: `officecli --version`

---

## Quick Reference

| Task | Read |
|------|------|
| Read / analyze content | View and query commands below |
| Create workbook from scratch | [creating.md](creating.md) |
| Edit existing workbook | [editing.md](editing.md) |
| Cell formatting, number formats | [reference/formatting.md](reference/formatting.md) |
| Formulas, cross-sheet refs | [reference/formulas.md](reference/formulas.md) |
| Charts | [reference/charts.md](reference/charts.md) |
| Tables, validation, CF, pivots | [reference/data-features.md](reference/data-features.md) |
| CSV import, shapes, raw XML | [reference/advanced.md](reference/advanced.md) |
| Complete worked examples | [example/](example/) |

---

## Execution Model

**Use interactive checkpoints. For repetitive edits, prefer small `officecli batch` chunks instead of hundreds of separate tool calls. Do not write an unobserved shell script and execute it as a single block.**

OfficeCLI is incremental: every `add`, `set`, and `remove` immediately modifies the file and returns output. Use this to catch errors early:

1. **Structural or risky operation: one command, then read the output.** Check the exit code before proceeding.
2. **Repetitive low-risk edits: use `officecli batch` (default ≤ 50 ops/block; pure value-set batches run fine at 80+ ops, verified at 82×80-op chunks with 0 failures).** Drop to ≤ 12 only for mixed formula + resident scenarios. Read the batch output before the next chunk.
3. **Non-zero exit = stop and fix immediately.** Do not continue building on a broken state.
4. **Verify after structural operations.** After adding a sheet, chart, pivot table, or named range, run `get` or `validate` before building on top of it.

Running a 50-command script all at once means the first error cascades silently through every subsequent command. Small observed batch chunks keep failure context local while avoiding unnecessary tool turns.

---

## Reading & Analyzing

### View Modes

```bash
officecli view data.xlsx text                              # Plain text dump, tab-separated
officecli view data.xlsx text --start 1 --end 50 --cols A,B,C  # Ranged text extraction
officecli view data.xlsx outline                           # Sheets with row/col/formula counts
officecli view data.xlsx annotated                         # Values with type/formula annotations
officecli view data.xlsx stats                             # Summary statistics
officecli view data.xlsx issues                            # Empty sheets, broken formulas, missing refs
```

### Element Inspection (`get`)

```bash
officecli get data.xlsx /                         # Workbook root (sheets, properties)
officecli get data.xlsx "/Sheet1"                  # Sheet overview (freeze, autoFilter, zoom)
officecli get data.xlsx "/Sheet1/A1"               # Single cell (value, type, formula, font, fill)
officecli get data.xlsx "/Sheet1/A1:D10"           # Cell range
officecli get data.xlsx "/Sheet1/row[1]"           # Row properties
officecli get data.xlsx "/Sheet1/col[A]"           # Column properties
officecli get data.xlsx "/Sheet1/chart[1]"         # Chart
officecli get data.xlsx "/Sheet1/table[1]"         # Table (ListObject)
officecli get data.xlsx "/Sheet1/validation[1]"    # Data validation rule
officecli get data.xlsx "/Sheet1/cf[1]"            # Conditional formatting rule
officecli get data.xlsx "/Sheet1/comment[1]"       # Comment
officecli get data.xlsx "/namedrange[1]"           # Named range
```

Add `--depth N` to expand children, `--json` for structured output. Excel notation also works: `Sheet1!A1`, `Sheet1!A1:D10`.

### CSS-like Queries

```bash
officecli query data.xlsx 'cell:has(formula)'          # Cells with formulas
officecli query data.xlsx 'cell:contains("Revenue")'   # Cells containing text
officecli query data.xlsx 'cell:empty'                  # Empty cells
officecli query data.xlsx 'cell[type=Number]'           # Cells by type
officecli query data.xlsx 'cell[font.bold=true]'        # Cells by formatting
officecli query data.xlsx 'B[value!=0]'                 # Column B non-zero
officecli query data.xlsx 'Sheet1!cell[value="100"]'    # Sheet-scoped
officecli query data.xlsx 'chart'                       # All charts
officecli query data.xlsx 'table'                       # All tables
officecli query data.xlsx 'pivottable'                  # All pivot tables
```

Operators: `=`, `!=`, `~=` (contains), `>=`, `<=`, `[attr]` (exists).

---

## Design Principles

### Use Formulas, Not Hardcoded Values (MANDATORY)

This is the single most important principle. The spreadsheet must remain dynamic -- when source data changes, formulas recalculate automatically. Hardcoded values break this contract.

```bash
# WRONG -- hardcoded calculation result
officecli set data.xlsx "/Sheet1/B10" --prop value=5000

# CORRECT -- let Excel calculate
officecli set data.xlsx "/Sheet1/B10" --prop formula="SUM(B2:B9)"
```

For formatting conventions, number formats, and layout → [reference/formatting.md](reference/formatting.md)

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

### Content QA

```bash
officecli view data.xlsx text                          # Check for missing data
officecli view data.xlsx outline                       # Check structure
officecli view data.xlsx issues                        # Broken formulas, missing refs
officecli query data.xlsx 'cell:has(formula)'          # Verify formulas exist
officecli query data.xlsx 'cell:contains("#REF!")'     # Formula error checks
officecli query data.xlsx 'cell:contains("#DIV/0!")'
officecli query data.xlsx 'cell:contains("#VALUE!")'
officecli query data.xlsx 'cell:contains("#NAME?")'
officecli query data.xlsx 'cell:contains("#N/A")'
```

When editing templates, check for leftover placeholders:

```bash
officecli query data.xlsx 'cell:contains("{{")'
officecli query data.xlsx 'cell:contains("xxxx")'
officecli query data.xlsx 'cell:contains("placeholder")'
```

### Formula Verification Checklist

- [ ] Test 2-3 sample cell references: verify they pull correct values
- [ ] Column mapping: confirm cell references point to intended columns
- [ ] Row offsets: check formula ranges include all data rows
- [ ] Division by zero: verify denominators are non-zero or wrapped in IFERROR
- [ ] Cross-sheet references: use correct `Sheet1!A1` format
- [ ] Cross-sheet formula escaping: run `officecli get` on 2-3 cross-sheet formula cells and confirm no `\!` in the formula string. If `\!` is present, the formula is broken -- delete and re-set using batch/heredoc.
- [ ] Named ranges: verify `ref` values match actual data locations
- [ ] Edge cases: test with zero values, negative numbers, empty cells
- [ ] **Chart data vs formula results**: for every chart with hardcoded/inline data, verify each data point matches the corresponding formula cell result. Use `officecli get` on the source cells and compare against chart series values. Mismatches here are silent data integrity bugs.

### Validation

```bash
officecli validate data.xlsx
```

### Verification Loop

1. Generate workbook
2. Run `view issues` + `view annotated` (sample ranges) + `validate`
3. Run formula error queries (all 5 error types)
4. List issues found (if none found, look again more critically)
5. Fix issues
6. Re-verify affected areas -- one fix often creates another problem
7. Repeat until a full pass reveals no new issues

**Do not declare success until you have completed at least one fix-and-verify cycle.**

**NOTE**: Unlike pptx (SVG/HTML), xlsx has no visual preview mode. Verification relies on `view text`, `view annotated`, `view stats`, `view issues`, `validate`, and formula queries. For visual verification, the user must open the file in Excel.

---

## Common Pitfalls

| Pitfall | Correct Approach |
|---------|-----------------|
| `--name "foo"` | Use `--prop name="foo"` -- all attributes go through `--prop` |
| Guessing property names | Run `officecli xlsx set cell` to see exact names |
| `\n` in shell strings | Use `\\n` for newlines in `--prop text="line1\\nline2"` |
| Modifying an open file | Close the file in Excel first |
| Hex colors with `#` | Use `FF0000` not `#FF0000` -- no hash prefix |
| Paths are 1-based | `"/Sheet1/row[1]"`, `"/Sheet1/col[1]"` -- XPath convention |
| `--index` is 0-based | `--index 0` = first position -- array convention |
| Unquoted `[N]` in zsh/bash | Shell glob-expands `/Sheet1/row[1]` -- always quote paths: `"/Sheet1/row[1]"` |
| Sheet names with spaces | Quote the full path: `"/My Sheet/A1"` |
| Formula prefix `=` | OfficeCLI strips the `=` -- use `formula="SUM(A1:A10)"` not `formula="=SUM(A1:A10)"` |
| Cross-sheet `!` in formulas | **CRITICAL:** The `!` in `Sheet1!A1` can be corrupted by shell quoting. Use batch/heredoc for cross-sheet formulas, or double quotes: `--prop "formula==Sheet1!A1"`. NEVER use single quotes for formulas containing `!`. After setting, verify with `officecli get` that the formula shows `Sheet1!A1` (no backslash before `!`). |
| Hardcoded calculated values | Use `--prop formula="SUM(B2:B9)"` not `--prop value=5000` |
| `$` and `'` in batch JSON | Use heredoc: `cat <<'EOF' \| officecli batch` -- single-quoted delimiter prevents shell expansion |
| Number format with `$` | Shell interprets `$` -- use single quotes: `numFmt='$#,##0'` |
| Year displayed as "2,026" | Set cell type to string: `--prop type=string` or use `numFmt="@"` |

---

## Performance: Resident Mode

**Always use `open`/`close` — it is the smart default.** Every command benefits: no repeated file I/O, no repeated parse/serialize cycles.

```bash
officecli open data.xlsx        # Load once into memory
officecli add data.xlsx ...     # All commands run in memory — fast
officecli set data.xlsx ...
officecli close data.xlsx       # Write once to disk
```

Use this pattern for every workbook build, regardless of command count.

## Performance: Batch Mode

```bash
cat <<'EOF' | officecli batch data.xlsx
[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Revenue","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Q1","bold":"true","fill":"1F4E79","font.color":"FFFFFF"}}
]
EOF
```

Batch supports: `add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `view`, `raw`, `raw-set`, `validate`.

Batch fields: `command`, `path`, `parent`, `type`, `from`, `to`, `index`, `after`, `before`, `props` (dict), `selector`, `mode`, `depth`, `part`, `xpath`, `action`, `xml`.

`parent` = container to add into (for `add`). `path` = element to modify (for `set`, `get`, `remove`, `move`, `swap`).

## Performance: CSV Bulk Import via Python (fast path)

For 600-6000+ cells from raw data (CSV, transformed data, scraped tables), `officecli import` is the simplest path when the data is a clean CSV with a header row:

```bash
officecli import data.xlsx "/Raw Data" --file data.csv --header
```

If the data is **not** a clean header+rows CSV — e.g. it needs filtering, type conversion, computed columns, or comes from a Python pipeline — generate the batch JSON in Python and pipe through `officecli batch`. This is dramatically faster than emitting hundreds of individual `set` commands (a 648-row / 6490-cell load completes in ~30s with zero failures).

```python
# gen_batch.py — produces batch chunks of 80 value-set ops each
import csv, json
ops = []
with open("data.csv") as f:
    reader = csv.reader(f)
    for r, row in enumerate(reader, start=1):
        for c, val in enumerate(row):
            col = chr(ord('A') + c)
            ops.append({"command": "set", "path": f"/Data/{col}{r}",
                        "props": {"value": val}})
for i in range(0, len(ops), 80):
    print(json.dumps(ops[i:i+80]))
```

```bash
python gen_batch.py | while IFS= read -r chunk; do
  printf '%s\n' "$chunk" | officecli batch data.xlsx
done
```

Tune chunk size: start at 80 ops, drop to 40 if any chunk fails. This recipe is **pure value injection** — apply numeric type inference, formulas, and formatting afterward via targeted `set` commands.

> Need Python and don't have it set up? Use the `env-setup` skill — never `pip install` against system Python.

---

## Known Issues

| Issue | Workaround |
|---|---|
| **Chart series cannot be added after creation** | `set --prop data=` and `set --prop seriesN=` on an existing chart can only update existing series. To add series, delete and recreate: `officecli remove data.xlsx "/Sheet1/chart[1]"` then `officecli add` with all series. |
| **No visual preview** | Unlike pptx (SVG/HTML), xlsx has no built-in rendering. Use `view text`/`view annotated`/`view stats`/`view issues` for verification. Users must open in Excel for visual check. |
| **Formula cached values for new formulas** | OfficeCLI writes formula strings natively. For newly added formulas, the cached value may not update until the file is opened in Excel/LibreOffice. Existing formula cached values are preserved. |
| **No auto-fit column width** | No "auto-fit" column width based on content. Set `width` explicitly on each column. |
| **Shell quoting in batch with echo** | `echo '...' \| officecli batch` fails when JSON values contain apostrophes or `$`. Use heredoc: `cat <<'EOF' \| officecli batch data.xlsx`. |
| **Cross-sheet formula deadlock** | Observed deadlocks (CPU 99%, `main pipe busy`, `kill -9` required) for cross-sheet formula batches **even at 3–5 ops** — the "≤ 12 ops safe" guideline is **not reliable** for cross-sheet formulas. Rule: **cross-sheet formulas go through non-resident one-big-batch OR individual `set`** (100% reliable). Pure value-set batches (no formulas) stay reliable at 50–80+ ops even in resident mode. |
| **Batch intermittent failure (resident + mixed formula)** | Batch+resident mode with mixed formulas has a higher failure rate. For maximum reliability: (1) prefer batch WITHOUT resident mode for mixed-formula workloads, (2) keep mixed-formula batches to ≤ 12 ops, (3) always check batch output for failures, (4) retry failed operations individually. Pure value-set batches do not need this restriction. |
| **Data bar default min/max invalid** | Creating a data bar without `--prop min=N --prop max=N` produces empty `val` attributes in cfvo elements, which may be rejected by strict XML validators or Excel. Always specify explicit min and max values. |
| **Cell protection requires sheet protection** | `locked` and `formulahidden` properties only take effect when the sheet itself is protected. |

---

## Help System

**When unsure about property names, value formats, or command syntax, run help instead of guessing.** One help query is faster than guess-fail-retry loops.

```bash
officecli xlsx set              # All settable elements and their properties
officecli xlsx set cell         # Cell properties in detail
officecli xlsx set cell.font    # Specific property format and examples
officecli xlsx add              # All addable element types
officecli xlsx view             # All view modes
officecli xlsx get              # All navigable paths
officecli xlsx query            # Query selector syntax
```
