<!-- officecli: v1.0.23 -->

# Creating Workbooks from Scratch

Use this guide when creating a new workbook with no template.

## Workflow

1. **Create** blank workbook
2. **Plan** sheet structure (sheets, data layout, formulas, charts)
3. **Build** incrementally -- one command at a time, check output, use batch for bulk cell data
4. **QA** -- see [SKILL.md](SKILL.md#qa-required)

> Execute incrementally -- one command (or one batch block) at a time. Read output after each. Fix failures before continuing. Verify structural changes with `validate` or `get`.

## Setup

```bash
# Create blank workbook (Sheet1 auto-created)
officecli create data.xlsx

# Set metadata
officecli set data.xlsx / --prop title="Q4 Financial Report" --prop author="Finance Team"

# Add sheets
officecli add data.xlsx / --type sheet --prop name="Revenue"
officecli add data.xlsx / --type sheet --prop name="Expenses"
officecli add data.xlsx / --type sheet --prop name="Summary"

# Set tab colors
officecli set data.xlsx "/Revenue" --prop tabColor=4472C4
officecli set data.xlsx "/Expenses" --prop tabColor=FF6600
officecli set data.xlsx "/Summary" --prop tabColor=2C5F2D

# Remove default Sheet1 (only after adding at least one other sheet)
officecli remove data.xlsx "/Sheet1"
```

## Building Blocks

Read the reference files for detailed syntax:

| Feature | Reference |
|---------|-----------|
| Cell values, formatting, number formats | [reference/formatting.md](reference/formatting.md) |
| Formulas, cross-sheet references | [reference/formulas.md](reference/formulas.md) |
| Charts (column, pie, line, combo) | [reference/charts.md](reference/charts.md) |
| Tables, validation, CF, pivot tables | [reference/data-features.md](reference/data-features.md) |
| CSV import, shapes, pictures, raw XML | [reference/advanced.md](reference/advanced.md) |

## Complete Recipes

For complete, copy-pasteable workbook sequences:

- [Financial Dashboard](example/financial-dashboard.md) -- multi-sheet, formulas, charts, CF, named ranges
- [Sales Tracker](example/sales-tracker.md) -- data entry, validation, tables, autofilter, sparklines
- [Data Analysis](example/data-analysis.md) -- pivot tables, multiple chart types, statistical formulas, CSV import
