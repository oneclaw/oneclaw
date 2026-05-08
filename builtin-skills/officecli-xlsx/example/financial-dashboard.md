<!-- officecli: v1.0.23 -->

# Recipe: Financial Dashboard

Complete, copy-pasteable sequence. Tests: multi-sheet, formulas, cross-sheet references, charts (column, pie, combo), conditional formatting (icon sets, data bars, color scales), number formatting, financial color coding, named ranges, freeze panes, tables, batch mode, resident mode.

```bash
# Create workbook and open in resident mode
officecli create financial-dashboard.xlsx
officecli open financial-dashboard.xlsx

# Metadata
officecli set financial-dashboard.xlsx / --prop title="FY2025 Financial Dashboard" --prop author="Finance Team"

# Add sheets (Sheet1 already exists, rename later or use as-is)
officecli add financial-dashboard.xlsx / --type sheet --prop name="Revenue"
officecli add financial-dashboard.xlsx / --type sheet --prop name="Expenses"
officecli add financial-dashboard.xlsx / --type sheet --prop name="PL"
officecli add financial-dashboard.xlsx / --type sheet --prop name="Dashboard"
officecli remove financial-dashboard.xlsx "/Sheet1"

# Tab colors
officecli set financial-dashboard.xlsx "/Revenue" --prop tabColor=4472C4
officecli set financial-dashboard.xlsx "/Expenses" --prop tabColor=FF6600
officecli set financial-dashboard.xlsx "/PL" --prop tabColor=2C5F2D
officecli set financial-dashboard.xlsx "/Dashboard" --prop tabColor=7030A0

# ── Revenue Sheet ──
# Headers
officecli set financial-dashboard.xlsx /Revenue/A1 --prop value=Month --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Revenue/B1 --prop value="Product A" --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Revenue/C1 --prop value="Product B" --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Revenue/D1 --prop value=Total --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF

# Monthly data -- blue text for hardcoded inputs
officecli set financial-dashboard.xlsx /Revenue/A2 --prop value=Jan
officecli set financial-dashboard.xlsx /Revenue/A3 --prop value=Feb
officecli set financial-dashboard.xlsx /Revenue/A4 --prop value=Mar
officecli set financial-dashboard.xlsx /Revenue/A5 --prop value=Apr
officecli set financial-dashboard.xlsx /Revenue/A6 --prop value=May
officecli set financial-dashboard.xlsx /Revenue/A7 --prop value=Jun
officecli set financial-dashboard.xlsx /Revenue/A8 --prop value=Jul
officecli set financial-dashboard.xlsx /Revenue/A9 --prop value=Aug
officecli set financial-dashboard.xlsx /Revenue/A10 --prop value=Sep
officecli set financial-dashboard.xlsx /Revenue/A11 --prop value=Oct
officecli set financial-dashboard.xlsx /Revenue/A12 --prop value=Nov
officecli set financial-dashboard.xlsx /Revenue/A13 --prop value=Dec

officecli set financial-dashboard.xlsx /Revenue/B2 --prop value=42000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B3 --prop value=45000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B4 --prop value=48000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B5 --prop value=51000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B6 --prop value=53000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B7 --prop value=56000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B8 --prop value=58000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B9 --prop value=55000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B10 --prop value=60000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B11 --prop value=62000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B12 --prop value=65000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/B13 --prop value=70000 --prop font.color=0000FF --prop numFmt='$#,##0'

officecli set financial-dashboard.xlsx /Revenue/C2 --prop value=28000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C3 --prop value=30000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C4 --prop value=32000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C5 --prop value=35000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C6 --prop value=36000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C7 --prop value=38000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C8 --prop value=40000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C9 --prop value=37000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C10 --prop value=42000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C11 --prop value=44000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C12 --prop value=46000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C13 --prop value=48000 --prop font.color=0000FF --prop numFmt='$#,##0'

# Total column -- SUM formulas in black text
officecli set financial-dashboard.xlsx /Revenue/D2 --prop formula="SUM(B2:C2)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D3 --prop formula="SUM(B3:C3)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D4 --prop formula="SUM(B4:C4)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D5 --prop formula="SUM(B5:C5)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D6 --prop formula="SUM(B6:C6)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D7 --prop formula="SUM(B7:C7)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D8 --prop formula="SUM(B8:C8)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D9 --prop formula="SUM(B9:C9)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D10 --prop formula="SUM(B10:C10)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D11 --prop formula="SUM(B11:C11)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D12 --prop formula="SUM(B12:C12)" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D13 --prop formula="SUM(B13:C13)" --prop font.color=000000 --prop numFmt='$#,##0'

# SUM row at bottom
officecli set financial-dashboard.xlsx /Revenue/A14 --prop value=Total --prop bold=true
officecli set financial-dashboard.xlsx /Revenue/B14 --prop formula="SUM(B2:B13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/C14 --prop formula="SUM(C2:C13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Revenue/D14 --prop formula="SUM(D2:D13)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'

# Revenue column widths and freeze
officecli set financial-dashboard.xlsx "/Revenue/col[A]" --prop width=12
officecli set financial-dashboard.xlsx "/Revenue/col[B]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue/col[C]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue/col[D]" --prop width=14
officecli set financial-dashboard.xlsx "/Revenue" --prop freeze=A2

# Revenue column chart
officecli add financial-dashboard.xlsx /Revenue --type chart --prop chartType=column --prop title="Monthly Revenue by Product" --prop series1.values="Revenue!B2:B13" --prop series1.categories="Revenue!A2:A13" --prop series1.name="Product A" --prop series2.values="Revenue!C2:C13" --prop series2.categories="Revenue!A2:A13" --prop series2.name="Product B" --prop x=6 --prop y=1 --prop width=12 --prop height=15 --prop colors=1F4E79,4472C4 --prop legend=bottom

# ── Expenses Sheet ──
officecli set financial-dashboard.xlsx /Expenses/A1 --prop value=Category --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Expenses/B1 --prop value=Monthly --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Expenses/C1 --prop value=Annual --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /Expenses/A2 --prop value=Rent
officecli set financial-dashboard.xlsx /Expenses/A3 --prop value=Salaries
officecli set financial-dashboard.xlsx /Expenses/A4 --prop value=Marketing
officecli set financial-dashboard.xlsx /Expenses/A5 --prop value=Operations
officecli set financial-dashboard.xlsx /Expenses/A6 --prop value=Technology
officecli set financial-dashboard.xlsx /Expenses/A7 --prop value=Total --prop bold=true
officecli set financial-dashboard.xlsx /Expenses/B2 --prop value=5000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B3 --prop value=45000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B4 --prop value=8000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B5 --prop value=6000 --prop font.color=0000FF --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/B6 --prop value=4000 --prop font.color=0000FF --prop numFmt='$#,##0'

officecli set financial-dashboard.xlsx /Expenses/B7 --prop formula="SUM(B2:B6)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C2 --prop formula="B2*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C3 --prop formula="B3*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C4 --prop formula="B4*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C5 --prop formula="B5*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C6 --prop formula="B6*12" --prop font.color=000000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Expenses/C7 --prop formula="SUM(C2:C6)" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'

# Expenses column widths and freeze
officecli set financial-dashboard.xlsx "/Expenses/col[A]" --prop width=15
officecli set financial-dashboard.xlsx "/Expenses/col[B]" --prop width=14
officecli set financial-dashboard.xlsx "/Expenses/col[C]" --prop width=14
officecli set financial-dashboard.xlsx "/Expenses" --prop freeze=A2

# Expense pie chart
officecli add financial-dashboard.xlsx /Expenses --type chart --prop chartType=pie --prop title="Expense Breakdown" --prop categories="Rent,Salaries,Marketing,Operations,Technology" --prop data="Monthly:5000,45000,8000,6000,4000" --prop colors=1F4E79,4472C4,70AD47,FFC000,FF6600 --prop dataLabels=percent --prop x=5 --prop y=1 --prop width=10 --prop height=12

# ── P&L Sheet ──
officecli set financial-dashboard.xlsx /PL/A1 --prop value=Metric --prop bold=true --prop fill=2C5F2D --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /PL/B1 --prop value=Annual --prop bold=true --prop fill=2C5F2D --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /PL/C1 --prop value="Margin %" --prop bold=true --prop fill=2C5F2D --prop font.color=FFFFFF
officecli set financial-dashboard.xlsx /PL/A2 --prop value="Total Revenue"
officecli set financial-dashboard.xlsx /PL/A3 --prop value="Total Expenses"
officecli set financial-dashboard.xlsx /PL/A4 --prop value="Net Income" --prop bold=true
officecli set financial-dashboard.xlsx /PL/A5 --prop value="Gross Margin %"

# Cross-sheet formulas -- green text
officecli set financial-dashboard.xlsx /PL/B2 --prop "formula==Revenue!D14" --prop font.color=008000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /PL/B3 --prop "formula==Expenses!C7" --prop font.color=008000 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /PL/B4 --prop formula="B2-B3" --prop font.color=000000 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /PL/C4 --prop formula="IFERROR(B4/B2,0)" --prop font.color=000000 --prop numFmt=0.0%

# P&L column widths and freeze
officecli set financial-dashboard.xlsx "/PL/col[A]" --prop width=18
officecli set financial-dashboard.xlsx "/PL/col[B]" --prop width=15
officecli set financial-dashboard.xlsx "/PL/col[C]" --prop width=12
officecli set financial-dashboard.xlsx "/PL" --prop freeze=A2

# Combo chart (revenue bars + margin line)
officecli add financial-dashboard.xlsx /PL --type chart --prop chartType=combo --prop title="Revenue vs Margin" --prop categories="Revenue,Expenses,Net Income" --prop series1="Amount:665000,816000,-151000" --prop series2="Margin:100,0,0" --prop comboSplit=1 --prop secondary=2 --prop colors=2C5F2D,FF6600 --prop x=5 --prop y=1 --prop width=12 --prop height=12

# ── Dashboard Sheet ──
officecli set financial-dashboard.xlsx /Dashboard/A1 --prop value="FY2025 Financial Dashboard" --prop bold=true --prop font.size=18 --prop font.color=1F4E79
officecli set financial-dashboard.xlsx /Dashboard/A1:D1 --prop merge=true
officecli set financial-dashboard.xlsx /Dashboard/A3 --prop value="Total Revenue" --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B3 --prop "formula==PL!B2" --prop font.color=008000 --prop font.size=16 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Dashboard/A4 --prop value="Total Expenses" --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B4 --prop "formula==PL!B3" --prop font.color=008000 --prop font.size=16 --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Dashboard/A5 --prop value="Net Income" --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B5 --prop "formula==PL!B4" --prop font.color=008000 --prop font.size=16 --prop bold=true --prop numFmt='$#,##0'
officecli set financial-dashboard.xlsx /Dashboard/A6 --prop value=Margin --prop bold=true
officecli set financial-dashboard.xlsx /Dashboard/B6 --prop "formula==PL!C4" --prop font.color=008000 --prop font.size=16 --prop numFmt=0.0%

# Dashboard column widths
officecli set financial-dashboard.xlsx "/Dashboard/col[A]" --prop width=20
officecli set financial-dashboard.xlsx "/Dashboard/col[B]" --prop width=18

# Conditional formatting on dashboard KPIs
officecli add financial-dashboard.xlsx /Dashboard --type databar --prop sqref="B3:B5" --prop color=4472C4 --prop min=0 --prop max=1000000
officecli add financial-dashboard.xlsx /Dashboard --type iconset --prop sqref="B6" --prop iconset=3TrafficLights1

# Named ranges for key assumptions
officecli add financial-dashboard.xlsx / --type namedrange --prop name="TotalRevenue" --prop ref="PL!B2" --prop comment="Annual total revenue"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="TotalExpenses" --prop ref="PL!B3" --prop comment="Annual total expenses"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="NetIncome" --prop ref="PL!B4" --prop comment="Annual net income"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="GrossMargin" --prop ref="PL!C4" --prop comment="Gross margin percentage"
officecli add financial-dashboard.xlsx / --type namedrange --prop name="MonthlyRent" --prop ref="Expenses!B2" --prop comment="Monthly rent assumption"

# QA
officecli view financial-dashboard.xlsx issues
officecli validate financial-dashboard.xlsx
officecli close financial-dashboard.xlsx
```
