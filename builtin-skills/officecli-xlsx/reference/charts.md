<!-- officecli: v1.0.23 -->

# Charts Reference

> **WARNING: Chart data accuracy** -- When charting data that comes from formulas (SUMIF, SUM, COUNTIF, etc.), always use cell range references (e.g., `series1.values="Sheet1!B2:B6"`) rather than hardcoding values. Hardcoded chart data will NOT update when formulas change, and manually transcribing values is error-prone -- R2 testing found a 30K discrepancy per rep when chart values were hardcoded instead of referencing SUMIF results. If you must use inline data (e.g., `data="Series:val1,val2"`), you MUST cross-verify every value against the source cell's formula result before delivery.

## Chart Creation

```bash
# PREFERRED: Column chart with cell-range references (data stays in sync with formulas)
officecli add data.xlsx /Sheet1 --type chart --prop chartType=column --prop title="Monthly Revenue" --prop series1.values="Sheet1!B2:B13" --prop series1.categories="Sheet1!A2:A13" --prop series1.name="Revenue" --prop x=5 --prop y=1 --prop width=15 --prop height=10

# CAUTION: Column chart with inline data (values are hardcoded -- will NOT track formula changes)
officecli add data.xlsx /Sheet1 --type chart --prop chartType=column --prop title="Revenue by Quarter" --prop categories="Q1,Q2,Q3,Q4" --prop series1="2025:42,58,65,78" --prop series2="2026:51,67,74,92" --prop x=5 --prop y=1 --prop width=15 --prop height=10 --prop colors=1F4E79,4472C4

# Pie chart
officecli add data.xlsx /Sheet1 --type chart --prop chartType=pie --prop title="Expense Breakdown" --prop categories="Rent,Salaries,Marketing,Operations" --prop data="Amount:5000,15000,3000,2000" --prop colors=1F4E79,4472C4,70AD47,FFC000 --prop dataLabels=percent

# Line chart
officecli add data.xlsx /Sheet1 --type chart --prop chartType=line --prop title="Trend" --prop categories="Jan,Feb,Mar,Apr,May,Jun" --prop series1="Revenue:10,15,13,20,22,28" --prop legend=bottom

# Scatter chart
officecli add data.xlsx /Sheet1 --type chart --prop chartType=scatter --prop title="Correlation" --prop categories="1,2,3,4,5" --prop data="Values:10,25,18,30,22"
```

## Chart Types

column, columnStacked, columnPercentStacked, column3d, bar, barStacked, barPercentStacked, bar3d, line, lineStacked, linePercentStacked, line3d, pie, pie3d, doughnut, area, areaStacked, areaPercentStacked, area3d, scatter, bubble, radar, stock, combo

## Combo Chart

```bash
# Bar + line on dual axes
officecli add data.xlsx /Sheet1 --type chart --prop chartType=combo --prop categories="Q1,Q2,Q3,Q4" --prop series1="Revenue:100,200,150,300" --prop series2="Margin:10,15,12,25" --prop comboSplit=1 --prop secondary=2 --prop colors=1F4E79,FF6600
```

`comboSplit=N` splits series: 1..N are bars, N+1..end are lines. `secondary=N` puts series N on secondary axis.

## Chart Styling Properties

`plotFill`, `chartFill`, `gridlines`, `dataLabels`, `labelPos`, `labelFont`, `axisFont`, `legendFont`, `title.font`, `title.size`, `title.color`, `series.outline`, `gapwidth`, `overlap`, `lineWidth`, `lineDash`, `marker`, `axisMin`, `axisMax`, `majorUnit`, `minorUnit`

## Post-Chart QA (MANDATORY)

Run after every `add chart`:

```bash
# Verify chart has data -- an empty chart is a BLOCKER
officecli get data.xlsx '/Sheet1/chart[1]' --json
# Check: each series MUST have non-empty "values" (inline) OR "valuesRef" (cell range).
# NOTE: When using cell range references (series1.values="Sheet1!B2:B13"), the "values" field
# will always be empty -- this is NORMAL. Only "valuesRef" will be populated.
# BLOCKER: If BOTH "values" AND "valuesRef" are empty → chart has no data. Remove and re-add.
```

## Known Issue: Series Count Fixed at Creation

Chart series count is fixed at creation. Cannot add new series via `set`. Delete and recreate to change series count.
