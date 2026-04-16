<!-- officecli: v1.0.23 -->
# Recipe: Data Analysis Workbook

Complete, copy-pasteable sequence. Tests: pivot tables, multiple chart types, statistical formulas, multi-sheet, CSV import.

```bash
officecli create data-analysis.xlsx
officecli open data-analysis.xlsx

# Metadata
officecli set data-analysis.xlsx / --prop title="Regional Sales Analysis" --prop author="Analytics Team"

# Sheets
officecli add data-analysis.xlsx / --type sheet --prop name="Raw Data"
officecli add data-analysis.xlsx / --type sheet --prop name="Pivot"
officecli add data-analysis.xlsx / --type sheet --prop name="Charts"
officecli add data-analysis.xlsx / --type sheet --prop name="Summary"
officecli remove data-analysis.xlsx "/Sheet1"

# ── Raw Data Sheet ──
# Headers
officecli set data-analysis.xlsx "/Raw Data/A1" --prop value=Date --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/B1" --prop value=Region --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/C1" --prop value=Category --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/D1" --prop value=Amount --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF
officecli set data-analysis.xlsx "/Raw Data/E1" --prop value=Quantity --prop bold=true --prop fill=1F4E79 --prop font.color=FFFFFF

# 50 rows of sample data (split into chunks of ~12 for batch reliability)
officecli set data-analysis.xlsx "/Raw Data/A2" --prop value=2025-01-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B2" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C2" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D2" --prop value=4500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E2" --prop value=12
officecli set data-analysis.xlsx "/Raw Data/A3" --prop value=2025-01-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B3" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C3" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D3" --prop value=2800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E3" --prop value=45
officecli set data-analysis.xlsx "/Raw Data/A4" --prop value=2025-01-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B4" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C4" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D4" --prop value=6200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E4" --prop value=18
officecli set data-analysis.xlsx "/Raw Data/A5" --prop value=2025-01-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B5" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C5" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D5" --prop value=1500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E5" --prop value=80
officecli set data-analysis.xlsx "/Raw Data/A6" --prop value=2025-02-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B6" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C6" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D6" --prop value=3200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E6" --prop value=50
officecli set data-analysis.xlsx "/Raw Data/A7" --prop value=2025-02-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B7" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C7" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D7" --prop value=5800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E7" --prop value=15
officecli set data-analysis.xlsx "/Raw Data/A8" --prop value=2025-02-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B8" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C8" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D8" --prop value=1800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E8" --prop value=90
officecli set data-analysis.xlsx "/Raw Data/A9" --prop value=2025-02-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B9" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C9" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D9" --prop value=2100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E9" --prop value=35
officecli set data-analysis.xlsx "/Raw Data/A10" --prop value=2025-02-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B10" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C10" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D10" --prop value=1200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E10" --prop value=60
officecli set data-analysis.xlsx "/Raw Data/A11" --prop value=2025-03-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B11" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C11" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D11" --prop value=1600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E11" --prop value=70

officecli set data-analysis.xlsx "/Raw Data/A12" --prop value=2025-03-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B12" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C12" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D12" --prop value=3800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E12" --prop value=55
officecli set data-analysis.xlsx "/Raw Data/A13" --prop value=2025-03-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B13" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C13" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D13" --prop value=7200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E13" --prop value=22
officecli set data-analysis.xlsx "/Raw Data/A14" --prop value=2025-03-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B14" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C14" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D14" --prop value=5100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E14" --prop value=14
officecli set data-analysis.xlsx "/Raw Data/A15" --prop value=2025-03-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B15" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C15" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D15" --prop value=2500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E15" --prop value=40
officecli set data-analysis.xlsx "/Raw Data/A16" --prop value=2025-04-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B16" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C16" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D16" --prop value=6800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E16" --prop value=20
officecli set data-analysis.xlsx "/Raw Data/A17" --prop value=2025-04-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B17" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C17" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D17" --prop value=1400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E17" --prop value=75
officecli set data-analysis.xlsx "/Raw Data/A18" --prop value=2025-04-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B18" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C18" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D18" --prop value=2900 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E18" --prop value=42
officecli set data-analysis.xlsx "/Raw Data/A19" --prop value=2025-04-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B19" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C19" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D19" --prop value=5500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E19" --prop value=16
officecli set data-analysis.xlsx "/Raw Data/A20" --prop value=2025-04-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B20" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C20" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D20" --prop value=1700 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E20" --prop value=85
officecli set data-analysis.xlsx "/Raw Data/A21" --prop value=2025-05-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B21" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C21" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D21" --prop value=2600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E21" --prop value=38

officecli set data-analysis.xlsx "/Raw Data/A22" --prop value=2025-05-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B22" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C22" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D22" --prop value=1300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E22" --prop value=65
officecli set data-analysis.xlsx "/Raw Data/A23" --prop value=2025-05-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B23" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C23" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D23" --prop value=3100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E23" --prop value=48
officecli set data-analysis.xlsx "/Raw Data/A24" --prop value=2025-05-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B24" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C24" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D24" --prop value=7500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E24" --prop value=25
officecli set data-analysis.xlsx "/Raw Data/A25" --prop value=2025-05-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B25" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C25" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D25" --prop value=6400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E25" --prop value=19
officecli set data-analysis.xlsx "/Raw Data/A26" --prop value=2025-06-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B26" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C26" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D26" --prop value=5600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E26" --prop value=17
officecli set data-analysis.xlsx "/Raw Data/A27" --prop value=2025-06-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B27" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C27" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D27" --prop value=1900 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E27" --prop value=72
officecli set data-analysis.xlsx "/Raw Data/A28" --prop value=2025-06-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B28" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C28" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D28" --prop value=3500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E28" --prop value=52
officecli set data-analysis.xlsx "/Raw Data/A29" --prop value=2025-06-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B29" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C29" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D29" --prop value=1100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E29" --prop value=58
officecli set data-analysis.xlsx "/Raw Data/A30" --prop value=2025-06-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B30" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C30" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D30" --prop value=2700 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E30" --prop value=44
officecli set data-analysis.xlsx "/Raw Data/A31" --prop value=2025-07-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B31" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C31" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D31" --prop value=6100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E31" --prop value=21

officecli set data-analysis.xlsx "/Raw Data/A32" --prop value=2025-07-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B32" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C32" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D32" --prop value=1500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E32" --prop value=82
officecli set data-analysis.xlsx "/Raw Data/A33" --prop value=2025-07-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B33" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C33" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D33" --prop value=2400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E33" --prop value=36
officecli set data-analysis.xlsx "/Raw Data/A34" --prop value=2025-07-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B34" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C34" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D34" --prop value=4800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E34" --prop value=13
officecli set data-analysis.xlsx "/Raw Data/A35" --prop value=2025-07-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B35" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C35" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D35" --prop value=3300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E35" --prop value=47
officecli set data-analysis.xlsx "/Raw Data/A36" --prop value=2025-08-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B36" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C36" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D36" --prop value=7100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E36" --prop value=23
officecli set data-analysis.xlsx "/Raw Data/A37" --prop value=2025-08-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B37" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C37" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D37" --prop value=1600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E37" --prop value=68
officecli set data-analysis.xlsx "/Raw Data/A38" --prop value=2025-08-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B38" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C38" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D38" --prop value=1400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E38" --prop value=62
officecli set data-analysis.xlsx "/Raw Data/A39" --prop value=2025-08-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B39" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C39" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D39" --prop value=5900 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E39" --prop value=18
officecli set data-analysis.xlsx "/Raw Data/A40" --prop value=2025-08-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B40" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C40" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D40" --prop value=4100 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E40" --prop value=56
officecli set data-analysis.xlsx "/Raw Data/A41" --prop value=2025-09-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B41" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C41" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D41" --prop value=6600 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E41" --prop value=20

officecli set data-analysis.xlsx "/Raw Data/A42" --prop value=2025-09-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B42" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C42" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D42" --prop value=3400 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E42" --prop value=46
officecli set data-analysis.xlsx "/Raw Data/A43" --prop value=2025-09-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B43" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C43" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D43" --prop value=2000 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E43" --prop value=76
officecli set data-analysis.xlsx "/Raw Data/A44" --prop value=2025-09-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B44" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C44" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D44" --prop value=7800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E44" --prop value=26
officecli set data-analysis.xlsx "/Raw Data/A45" --prop value=2025-09-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B45" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C45" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D45" --prop value=2300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E45" --prop value=33
officecli set data-analysis.xlsx "/Raw Data/A46" --prop value=2025-10-01 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B46" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C46" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D46" --prop value=5300 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E46" --prop value=15
officecli set data-analysis.xlsx "/Raw Data/A47" --prop value=2025-10-05 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B47" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C47" --prop value=Electronics
officecli set data-analysis.xlsx "/Raw Data/D47" --prop value=4700 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E47" --prop value=14
officecli set data-analysis.xlsx "/Raw Data/A48" --prop value=2025-10-10 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B48" --prop value=East
officecli set data-analysis.xlsx "/Raw Data/C48" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D48" --prop value=1800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E48" --prop value=88
officecli set data-analysis.xlsx "/Raw Data/A49" --prop value=2025-10-15 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B49" --prop value=West
officecli set data-analysis.xlsx "/Raw Data/C49" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D49" --prop value=1200 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E49" --prop value=55
officecli set data-analysis.xlsx "/Raw Data/A50" --prop value=2025-10-20 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B50" --prop value=North
officecli set data-analysis.xlsx "/Raw Data/C50" --prop value=Food
officecli set data-analysis.xlsx "/Raw Data/D50" --prop value=1500 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E50" --prop value=70
officecli set data-analysis.xlsx "/Raw Data/A51" --prop value=2025-10-25 --prop numFmt=yyyy-mm-dd
officecli set data-analysis.xlsx "/Raw Data/B51" --prop value=South
officecli set data-analysis.xlsx "/Raw Data/C51" --prop value=Clothing
officecli set data-analysis.xlsx "/Raw Data/D51" --prop value=2800 --prop numFmt='$#,##0'
officecli set data-analysis.xlsx "/Raw Data/E51" --prop value=41

# Raw Data column widths and freeze
officecli set data-analysis.xlsx "/Raw Data/col[A]" --prop width=12
officecli set data-analysis.xlsx "/Raw Data/col[B]" --prop width=10
officecli set data-analysis.xlsx "/Raw Data/col[C]" --prop width=14
officecli set data-analysis.xlsx "/Raw Data/col[D]" --prop width=12
officecli set data-analysis.xlsx "/Raw Data/col[E]" --prop width=10
officecli set data-analysis.xlsx "/Raw Data" --prop freeze=A2

# Named ranges for data extent
officecli add data-analysis.xlsx / --type namedrange --prop name="DataRange" --prop ref="'Raw Data'!A1:E51"
officecli add data-analysis.xlsx / --type namedrange --prop name="AmountColumn" --prop ref="'Raw Data'!D2:D51"
officecli add data-analysis.xlsx / --type namedrange --prop name="QuantityColumn" --prop ref="'Raw Data'!E2:E51"

# ── Pivot Sheet ──
officecli add data-analysis.xlsx /Pivot --type pivottable --prop source="'Raw Data'!A1:E51" --prop position="A1" --prop rows="Region,Category" --prop values="Amount:sum,Quantity:avg" --prop name="SalesAnalysis" --prop style=PivotStyleMedium2

# ── Charts Sheet ──
# Bar chart: total by region
officecli add data-analysis.xlsx /Charts --type chart --prop chartType=bar --prop title="Total Sales by Region" --prop categories="North,South,East,West" --prop data="Sales:26900,25400,33800,22200" --prop colors=1F4E79 --prop x=0 --prop y=0 --prop width=12 --prop height=12 --prop dataLabels=true

# Line chart: monthly trend
officecli add data-analysis.xlsx /Charts --type chart --prop chartType=line --prop title="Monthly Sales Trend" --prop categories="Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct" --prop data="Amount:14500,10100,15600,15500,16400,9900,17600,19800,13500,12000" --prop colors=4472C4 --prop x=0 --prop y=14 --prop width=12 --prop height=12 --prop legend=none

# Scatter chart: amount vs quantity
officecli add data-analysis.xlsx /Charts --type chart --prop chartType=scatter --prop title="Amount vs Quantity" --prop categories="12,45,18,80,50,15,90,35,60,70,55,22,14,40,20,75,42,16,85,38,65,48,25,19,17,72,52,58,46,76,26,33,15,14,88,55,70,41" --prop data="Amount:4500,2800,6200,1500,3200,5800,1800,2100,1200,1600,3800,7200,5100,2500,6800,1400,2900,5500,1700,2600,1300,3100,7500,6400,5600,1900,3500,1100,2700,6100,1500,2400,4800,3300,7100,1600,1400,5900" --prop colors=FF6600 --prop x=14 --prop y=0 --prop width=12 --prop height=12

# ── Summary Sheet ──
officecli set data-analysis.xlsx /Summary/A1 --prop value="Data Analysis Summary" --prop bold=true --prop font.size=16 --prop font.color=1F4E79
officecli set data-analysis.xlsx /Summary/A1:D1 --prop merge=true
officecli set data-analysis.xlsx /Summary/A3 --prop value="Overall Statistics" --prop bold=true --prop font.size=13
officecli set data-analysis.xlsx /Summary/A4 --prop value="Total Amount"
officecli set data-analysis.xlsx /Summary/B4 --prop "formula==SUM('Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A5 --prop value="Average Amount"
officecli set data-analysis.xlsx /Summary/B5 --prop "formula==AVERAGE('Raw Data'!D2:D51)" --prop numFmt='$#,##0.00'
officecli set data-analysis.xlsx /Summary/A6 --prop value="Min Amount"
officecli set data-analysis.xlsx /Summary/B6 --prop "formula==MIN('Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A7 --prop value="Max Amount"
officecli set data-analysis.xlsx /Summary/B7 --prop "formula==MAX('Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A8 --prop value="Record Count"
officecli set data-analysis.xlsx /Summary/B8 --prop "formula==COUNTA('Raw Data'!A2:A51)"

officecli set data-analysis.xlsx /Summary/A10 --prop value="By Region" --prop bold=true --prop font.size=13
officecli set data-analysis.xlsx /Summary/A11 --prop value=North
officecli set data-analysis.xlsx /Summary/B11 --prop "formula==SUMIF('Raw Data'!B2:B51,\"North\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A12 --prop value=South
officecli set data-analysis.xlsx /Summary/B12 --prop "formula==SUMIF('Raw Data'!B2:B51,\"South\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A13 --prop value=East
officecli set data-analysis.xlsx /Summary/B13 --prop "formula==SUMIF('Raw Data'!B2:B51,\"East\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'
officecli set data-analysis.xlsx /Summary/A14 --prop value=West
officecli set data-analysis.xlsx /Summary/B14 --prop "formula==SUMIF('Raw Data'!B2:B51,\"West\",'Raw Data'!D2:D51)" --prop numFmt='$#,##0'

# Summary column widths
officecli set data-analysis.xlsx "/Summary/col[A]" --prop width=20
officecli set data-analysis.xlsx "/Summary/col[B]" --prop width=15

# QA
officecli view data-analysis.xlsx issues
officecli validate data-analysis.xlsx
officecli close data-analysis.xlsx
```

**CSV import alternative:** If data exists as a CSV file, replace the Raw Data batch commands with:

```bash
officecli import data-analysis.xlsx "/Raw Data" --file data.csv --header
```

The `--header` flag auto-sets AutoFilter and freeze panes on the header row.
