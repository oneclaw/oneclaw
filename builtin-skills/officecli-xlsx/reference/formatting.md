<!-- officecli: v1.0.23 -->

# Formatting Reference

## Cell Values

```bash
# String value
officecli set data.xlsx "/Sheet1/A1" --prop value="Revenue" --prop type=string

# Number value
officecli set data.xlsx "/Sheet1/B2" --prop value=1234.56

# Formula
officecli set data.xlsx "/Sheet1/B10" --prop formula="SUM(B2:B9)"

# Boolean
officecli set data.xlsx "/Sheet1/C1" --prop value=true --prop type=boolean

# Clear cell
officecli set data.xlsx "/Sheet1/A5" --prop clear=true

# Hyperlink
officecli set data.xlsx "/Sheet1/A1" --prop link="https://example.com"
```

## Cell Formatting

```bash
# Font
officecli set data.xlsx "/Sheet1/A1" --prop font.name=Arial --prop font.size=12 --prop bold=true --prop font.color=1F4E79

# Fill (solid)
officecli set data.xlsx "/Sheet1/A1" --prop fill=D9E2F3

# Fill (gradient)
officecli set data.xlsx "/Sheet1/A1" --prop fill=D9E2F3-1F4E79

# Number format (single-quote $ to prevent shell expansion)
officecli set data.xlsx "/Sheet1/B2" --prop numFmt='$#,##0.00'

# Alignment
officecli set data.xlsx "/Sheet1/A1" --prop halign=center --prop valign=center --prop wrap=true

# Rotation
officecli set data.xlsx "/Sheet1/A1" --prop rotation=45

# Borders
officecli set data.xlsx "/Sheet1/A1:D10" --prop border.all=thin --prop border.color=CCCCCC
officecli set data.xlsx "/Sheet1/A1:D1" --prop border.bottom=medium --prop border.bottom.color=000000

# Merge
officecli set data.xlsx "/Sheet1/A1:D1" --prop merge=true

# Indent
officecli set data.xlsx "/Sheet1/A2" --prop indent=2
```

## Rich Text Runs

Rich text allows mixed formatting within a single cell. Use `add --type run` to create the initial rich text cell, then `set` on existing runs.

```bash
# Create rich text cell with first run
officecli add data.xlsx "/Sheet1/A1" --type run --prop text="Bold part " --prop bold=true --prop color=0000FF

# Add second run with different formatting
officecli add data.xlsx "/Sheet1/A1" --type run --prop text="normal part" --prop bold=false
```

## Number Format Strings

| Type | Format String | Example Output | Code |
|------|--------------|----------------|------|
| Currency | `$#,##0` | $1,234 | `--prop numFmt='$#,##0'` |
| Currency (neg parens) | `$#,##0;($#,##0);"-"` | ($1,234) | `--prop numFmt='$#,##0;($#,##0);"-"'` |
| Percentage | `0.0%` | 12.5% | `--prop numFmt="0.0%"` |
| Decimal | `#,##0.00` | 1,234.56 | `--prop numFmt="#,##0.00"` |
| Accounting | `_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)` | $ 1,234 | `--prop numFmt='_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)'` |
| Date | `yyyy-mm-dd` | 2026-03-27 | `--prop numFmt="yyyy-mm-dd"` |
| Date (long) | `mmmm d, yyyy` | March 27, 2026 | `--prop numFmt="mmmm d, yyyy"` |
| Year as text | `@` | 2026 (not 2,026) | `--prop type=string` |
| Multiples | `0.0x` | 12.5x | `--prop numFmt="0.0x"` |
| Zeros as dash | `#,##0;-#,##0;"-"` | - | `--prop numFmt='#,##0;-#,##0;"-"'` |

**Cross-platform tip:** for any number format containing `$`, `"`, or other characters that some shells re-interpret, set `numFmt` via a batch JSON file (`officecli batch <file> --input batch.json`). Inside JSON strings, `$` and quotes are literal — no shell escaping required, identical behavior on macOS / Windows cmd / PowerShell.

## Financial Model Color Coding

| Convention | Color | Use For |
|-----------|-------|---------|
| Blue text | `font.color=0000FF` | Hardcoded inputs, scenario-variable numbers |
| Black text | `font.color=000000` | ALL formulas and calculations |
| Green text | `font.color=008000` | Cross-sheet links within same workbook |
| Red text | `font.color=FF0000` | External references |
| Yellow background | `fill=FFFF00` | Key assumptions needing attention |

These are industry-standard financial modeling conventions. Apply when building financial models. For non-financial workbooks, use project-appropriate styling.

## Column Width and Row Height

```bash
# Set column width (character units, ~1 char = 7px)
officecli set data.xlsx "/Sheet1/col[A]" --prop width=15
officecli set data.xlsx "/Sheet1/col[B]" --prop width=12

# Set row height (points)
officecli set data.xlsx "/Sheet1/row[1]" --prop height=20

# Hide column/row
officecli set data.xlsx "/Sheet1/col[D]" --prop hidden=true
officecli set data.xlsx "/Sheet1/row[5]" --prop hidden=true
```

There is no auto-fit. Set column widths explicitly. Common widths: labels=20-25, numbers=12-15, dates=12, short codes=8-10.

## Freeze Panes

```bash
# Freeze first row (headers)
officecli set data.xlsx "/Sheet1" --prop freeze=A2

# Freeze first column and first row
officecli set data.xlsx "/Sheet1" --prop freeze=B2
```

## Print Area

```bash
# Set print area on a sheet
officecli set data.xlsx "/Sheet1" --prop printArea="A1:F20"
```
