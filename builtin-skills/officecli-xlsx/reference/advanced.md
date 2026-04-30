<!-- officecli: v1.0.23 -->

# Advanced Features Reference

## CSV Import

```bash
# Import CSV into a sheet
officecli import data.xlsx /Sheet1 --file data.csv

# Import with header detection (auto-sets AutoFilter and freeze panes)
officecli import data.xlsx /Sheet1 --file data.csv --header

# Import TSV
officecli import data.xlsx /Sheet1 --file data.tsv --format tsv

# Import starting at specific cell
officecli import data.xlsx /Sheet1 --file data.csv --start-cell B5
```

Always read the CSV/TSV from a file with `--file <path>`. Do not pipe via stdin — Windows PowerShell 5 defaults to UTF-16LE output and corrupts the bytes before `officecli` sees them.

## Shapes and Textboxes

```bash
# Shape with fill
officecli add data.xlsx /Sheet1 --type shape --prop text="KPI: Revenue" --prop fill=4472C4 --prop color=FFFFFF --prop bold=true --prop x=1 --prop y=1 --prop width=5 --prop height=3

# Transparent textbox (annotation)
officecli add data.xlsx /Sheet1 --type textbox --prop text="Data source: Q4 report" --prop fill=none --prop size=9 --prop color=888888
```

## Pictures

```bash
officecli add data.xlsx /Sheet1 --type picture --prop src=logo.png --prop x=1 --prop y=1 --prop width=3 --prop height=2 --prop alt="Company logo"
```

## Comments

```bash
officecli add data.xlsx /Sheet1 --type comment --prop ref=B2 --prop text="Source: Annual Report 2025, p.45" --prop author="Analyst"
```

## Row/Column Grouping (Outline)

```bash
# Group rows for expandable detail sections
officecli set data.xlsx "/Sheet1/row[3]" --prop outline=1
officecli set data.xlsx "/Sheet1/row[4]" --prop outline=1
officecli set data.xlsx "/Sheet1/row[5]" --prop outline=1

# Collapse the group
officecli set data.xlsx "/Sheet1/row[3]" --prop collapsed=true
```

Outline levels range from 0 (no grouping) to 7. Also works on columns.

## Raw XML

For advanced chart customization not available through high-level commands (trendlines, custom 3D perspectives, gradient fills on individual series):

```bash
# Create a chart part (--type flag required)
officecli add-part data.xlsx /Sheet1 --type chart

# Inject custom chart XML
officecli raw-set data.xlsx "/Sheet1/chart[1]" --xpath "//c:plotArea" --action append --xml '<c:trendline><c:trendlineType val="linear"/></c:trendline>'
```

Use high-level `add --type chart` first. Fall back to raw XML only for features not exposed by high-level commands.

XPath prefixes: `x` (SpreadsheetML), `r` (Relationships), `a` (DrawingML), `c` (Charts), `xdr` (Spreadsheet Drawing)

Raw XML actions: append, prepend, replace, remove, insertBefore, insertAfter, setAttribute, removeAttribute

## Batch Mode Field Reference

All 17 fields available in batch JSON operations:

| Field | Description |
|-------|-------------|
| `command` | Operation to perform: add, set, get, query, remove, move, swap, view, raw, raw-set, validate |
| `path` | Element to modify (for set, get, remove, move, swap) |
| `parent` | Container to add into (for add) |
| `type` | Element type to create (sheet, chart, table, validation, etc.) |
| `from` | Source path (for move, swap) |
| `to` | Destination path (for move, swap) |
| `index` | 0-based position index (for add with ordering) |
| `after` | Insert after this element (for add) |
| `before` | Insert before this element (for add) |
| `props` | Dictionary of properties to set (key-value pairs) |
| `selector` | CSS-like query selector (for query command) |
| `mode` | View mode: text, outline, annotated, stats, issues (for view) |
| `depth` | Expansion depth for get (for get with --depth) |
| `part` | Part type for add-part (for raw XML operations) |
| `xpath` | XPath expression (for raw, raw-set) |
| `action` | Raw XML action: append, prepend, replace, remove, etc. (for raw-set) |
| `xml` | Raw XML string to inject (for raw-set) |
