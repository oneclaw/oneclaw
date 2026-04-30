<!-- officecli: v1.0.23 -->
# Recipe: Sales Tracker

Complete, copy-pasteable sequence. Tests: data entry layout, validation, autofilter, tables, sparklines, conditional formatting.

```bash
officecli create sales-tracker.xlsx
officecli open sales-tracker.xlsx

# Metadata
officecli set sales-tracker.xlsx / --prop title="Sales Tracker 2025" --prop author="Sales Ops"

# Rename Sheet1 is not directly supported; add new sheet and remove old
officecli add sales-tracker.xlsx / --type sheet --prop name="Sales Data"
officecli add sales-tracker.xlsx / --type sheet --prop name="Summary"
officecli remove sales-tracker.xlsx "/Sheet1"

# ── Sales Data Sheet ──
# Headers
officecli set sales-tracker.xlsx "/Sales Data/A1" --prop value=Date --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/B1" --prop value="Sales Rep" --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/C1" --prop value=Region --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/D1" --prop value=Product --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/E1" --prop value=Amount --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set sales-tracker.xlsx "/Sales Data/F1" --prop value=Status --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF

# Sample data rows
officecli set sales-tracker.xlsx "/Sales Data/A2" --prop value=2025-01-15 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B2" --prop value="Alice Chen"
officecli set sales-tracker.xlsx "/Sales Data/C2" --prop value=North
officecli set sales-tracker.xlsx "/Sales Data/D2" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E2" --prop value=12500 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F2" --prop value=Won
officecli set sales-tracker.xlsx "/Sales Data/A3" --prop value=2025-01-22 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B3" --prop value="Bob Martinez"
officecli set sales-tracker.xlsx "/Sales Data/C3" --prop value=South
officecli set sales-tracker.xlsx "/Sales Data/D3" --prop value="Widget Basic"
officecli set sales-tracker.xlsx "/Sales Data/E3" --prop value=8200 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F3" --prop value=Won

officecli set sales-tracker.xlsx "/Sales Data/A4" --prop value=2025-02-03 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B4" --prop value="Carol Wu"
officecli set sales-tracker.xlsx "/Sales Data/C4" --prop value=East
officecli set sales-tracker.xlsx "/Sales Data/D4" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E4" --prop value=15800 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F4" --prop value=Pending
officecli set sales-tracker.xlsx "/Sales Data/A5" --prop value=2025-02-10 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B5" --prop value="Dave Kim"
officecli set sales-tracker.xlsx "/Sales Data/C5" --prop value=West
officecli set sales-tracker.xlsx "/Sales Data/D5" --prop value="Widget Enterprise"
officecli set sales-tracker.xlsx "/Sales Data/E5" --prop value=32000 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F5" --prop value=Won

officecli set sales-tracker.xlsx "/Sales Data/A6" --prop value=2025-02-18 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B6" --prop value="Alice Chen"
officecli set sales-tracker.xlsx "/Sales Data/C6" --prop value=North
officecli set sales-tracker.xlsx "/Sales Data/D6" --prop value="Widget Basic"
officecli set sales-tracker.xlsx "/Sales Data/E6" --prop value=6500 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F6" --prop value=Lost
officecli set sales-tracker.xlsx "/Sales Data/A7" --prop value=2025-03-01 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B7" --prop value="Bob Martinez"
officecli set sales-tracker.xlsx "/Sales Data/C7" --prop value=South
officecli set sales-tracker.xlsx "/Sales Data/D7" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E7" --prop value=18500 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F7" --prop value=Open

officecli set sales-tracker.xlsx "/Sales Data/A8" --prop value=2025-03-12 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B8" --prop value="Carol Wu"
officecli set sales-tracker.xlsx "/Sales Data/C8" --prop value=East
officecli set sales-tracker.xlsx "/Sales Data/D8" --prop value="Widget Enterprise"
officecli set sales-tracker.xlsx "/Sales Data/E8" --prop value=45000 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F8" --prop value=Won
officecli set sales-tracker.xlsx "/Sales Data/A9" --prop value=2025-03-20 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B9" --prop value="Dave Kim"
officecli set sales-tracker.xlsx "/Sales Data/C9" --prop value=West
officecli set sales-tracker.xlsx "/Sales Data/D9" --prop value="Widget Pro"
officecli set sales-tracker.xlsx "/Sales Data/E9" --prop value=14200 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F9" --prop value=Pending

officecli set sales-tracker.xlsx "/Sales Data/A10" --prop value=2025-04-05 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B10" --prop value="Alice Chen"
officecli set sales-tracker.xlsx "/Sales Data/C10" --prop value=North
officecli set sales-tracker.xlsx "/Sales Data/D10" --prop value="Widget Enterprise"
officecli set sales-tracker.xlsx "/Sales Data/E10" --prop value=52000 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F10" --prop value=Won
officecli set sales-tracker.xlsx "/Sales Data/A11" --prop value=2025-04-15 --prop numFmt=yyyy-mm-dd
officecli set sales-tracker.xlsx "/Sales Data/B11" --prop value="Bob Martinez"
officecli set sales-tracker.xlsx "/Sales Data/C11" --prop value=South
officecli set sales-tracker.xlsx "/Sales Data/D11" --prop value="Widget Basic"
officecli set sales-tracker.xlsx "/Sales Data/E11" --prop value=7800 --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx "/Sales Data/F11" --prop value=Won

# Data validation
officecli add sales-tracker.xlsx "/Sales Data" --type validation --prop sqref="C2:C100" --prop type=list --prop formula1="North,South,East,West" --prop showError=true --prop errorTitle="Invalid Region" --prop error="Select: North, South, East, West"
officecli add sales-tracker.xlsx "/Sales Data" --type validation --prop sqref="F2:F100" --prop type=list --prop formula1="Open,Won,Lost,Pending" --prop showError=true --prop errorTitle="Invalid Status" --prop error="Select: Open, Won, Lost, Pending"
officecli add sales-tracker.xlsx "/Sales Data" --type validation --prop sqref="E2:E100" --prop type=decimal --prop operator=greaterThanOrEqual --prop formula1=0 --prop showError=true --prop error="Amount must be >= 0"

# Table (ListObject)
officecli add sales-tracker.xlsx "/Sales Data" --type table --prop ref="A1:F11" --prop name="SalesData" --prop displayName="SalesData" --prop style=TableStyleMedium2 --prop headerRow=true

# AutoFilter
officecli add sales-tracker.xlsx "/Sales Data" --type autofilter --prop range="A1:F11"

# Column widths and freeze
officecli set sales-tracker.xlsx "/Sales Data/col[A]" --prop width=12
officecli set sales-tracker.xlsx "/Sales Data/col[B]" --prop width=16
officecli set sales-tracker.xlsx "/Sales Data/col[C]" --prop width=10
officecli set sales-tracker.xlsx "/Sales Data/col[D]" --prop width=18
officecli set sales-tracker.xlsx "/Sales Data/col[E]" --prop width=12
officecli set sales-tracker.xlsx "/Sales Data/col[F]" --prop width=10
officecli set sales-tracker.xlsx "/Sales Data" --prop freeze=A2

# Conditional formatting on Amount column
officecli add sales-tracker.xlsx "/Sales Data" --type colorscale --prop sqref="E2:E11" --prop mincolor=FFFFFF --prop maxcolor=4472C4

# Formula-based CF: highlight Won rows
officecli add sales-tracker.xlsx "/Sales Data" --type formulacf --prop sqref="A2:F11" --prop formula='$F2="Won"' --prop fill=D9E2F3

# ── Summary Sheet ──
officecli set sales-tracker.xlsx /Summary/A1 --prop value="Sales Summary" --prop bold=true --prop font.size=16 --prop font.color=1F4E79
officecli set sales-tracker.xlsx /Summary/A1:D1 --prop merge=true
officecli set sales-tracker.xlsx /Summary/A3 --prop value="By Region" --prop bold=true --prop font.size=13
officecli set sales-tracker.xlsx /Summary/A4 --prop value=North
officecli set sales-tracker.xlsx /Summary/A5 --prop value=South
officecli set sales-tracker.xlsx /Summary/A6 --prop value=East
officecli set sales-tracker.xlsx /Summary/A7 --prop value=West

officecli set sales-tracker.xlsx /Summary/B3 --prop value=Total --prop bold=true
officecli set sales-tracker.xlsx /Summary/C3 --prop value=Count --prop bold=true
officecli set sales-tracker.xlsx /Summary/D3 --prop value=Trend --prop bold=true
officecli set sales-tracker.xlsx /Summary/B4 --prop "formula==SUMIF('Sales Data'!C2:C11,\"North\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/B5 --prop "formula==SUMIF('Sales Data'!C2:C11,\"South\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/B6 --prop "formula==SUMIF('Sales Data'!C2:C11,\"East\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/B7 --prop "formula==SUMIF('Sales Data'!C2:C11,\"West\",'Sales Data'!E2:E11)" --prop numFmt='$#,##0'
officecli set sales-tracker.xlsx /Summary/C4 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"North\")"
officecli set sales-tracker.xlsx /Summary/C5 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"South\")"
officecli set sales-tracker.xlsx /Summary/C6 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"East\")"
officecli set sales-tracker.xlsx /Summary/C7 --prop "formula==COUNTIF('Sales Data'!C2:C11,\"West\")"

# Status summary
# NOTE: Cross-sheet formulas MUST go through `officecli batch <file> --input <jsonfile>` (write the JSON via the Write tool) to avoid any shell interpretation of `!`. The forms below use `--prop "formula==..."` which works on macOS/zsh; on Windows use the JSON-file path.
officecli set sales-tracker.xlsx /Summary/A9 --prop value="By Status" --prop bold=true --prop font.size=13
officecli set sales-tracker.xlsx /Summary/A10 --prop value=Open
officecli set sales-tracker.xlsx /Summary/A11 --prop value=Won
officecli set sales-tracker.xlsx /Summary/A12 --prop value=Lost
officecli set sales-tracker.xlsx /Summary/A13 --prop value=Pending
officecli set sales-tracker.xlsx /Summary/B9 --prop value=Count --prop bold=true
officecli set sales-tracker.xlsx /Summary/B10 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Open\")"
officecli set sales-tracker.xlsx /Summary/B11 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Won\")"
officecli set sales-tracker.xlsx /Summary/B12 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Lost\")"
officecli set sales-tracker.xlsx /Summary/B13 --prop "formula==COUNTIF('Sales Data'!F2:F11,\"Pending\")"

# Sparklines for each region (trend from Amount data)
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D4 --prop range="'Sales Data'!E2:E4" --prop type=line --prop color=4472C4
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D5 --prop range="'Sales Data'!E5:E7" --prop type=line --prop color=FF6600
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D6 --prop range="'Sales Data'!E8:E9" --prop type=line --prop color=70AD47
officecli add sales-tracker.xlsx /Summary --type sparkline --prop cell=D7 --prop range="'Sales Data'!E10:E11" --prop type=line --prop color=FFC000

# Summary column widths
officecli set sales-tracker.xlsx "/Summary/col[A]" --prop width=14
officecli set sales-tracker.xlsx "/Summary/col[B]" --prop width=14
officecli set sales-tracker.xlsx "/Summary/col[C]" --prop width=10
officecli set sales-tracker.xlsx "/Summary/col[D]" --prop width=12

# QA
officecli view sales-tracker.xlsx issues
officecli validate sales-tracker.xlsx
officecli close sales-tracker.xlsx
```
