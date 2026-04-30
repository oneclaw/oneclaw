<!-- officecli: v1.0.23 -->

# Data Features Reference

## Tables (ListObjects)

```bash
officecli add data.xlsx /Sheet1 --type table --prop ref="A1:E20" --prop name="SalesData" --prop displayName="SalesData" --prop style=TableStyleMedium2 --prop headerRow=true
```

Default style is `TableStyleMedium2`. Other options: `TableStyleLight1`..`TableStyleLight21`, `TableStyleMedium1`..`TableStyleMedium28`, `TableStyleDark1`..`TableStyleDark11`.

## Data Validation

```bash
# Dropdown list
officecli add data.xlsx /Sheet1 --type validation --prop sqref="C2:C100" --prop type=list --prop formula1="North,South,East,West"

# Whole number range
officecli add data.xlsx /Sheet1 --type validation --prop sqref="D2:D100" --prop type=whole --prop operator=between --prop formula1=1 --prop formula2=1000

# Date validation
officecli add data.xlsx /Sheet1 --type validation --prop sqref="A2:A100" --prop type=date --prop operator=greaterThan --prop formula1="2025-01-01"

# Custom formula validation
officecli add data.xlsx /Sheet1 --type validation --prop sqref="E2:E100" --prop type=custom --prop formula1="E2>D2"

# With error and input messages
officecli add data.xlsx /Sheet1 --type validation --prop sqref="F2:F100" --prop type=decimal --prop operator=between --prop formula1=0 --prop formula2=100 --prop showError=true --prop errorTitle="Invalid Entry" --prop error="Enter a value between 0 and 100" --prop showInput=true --prop promptTitle="Percentage" --prop prompt="Enter a percentage (0-100)"
```

Validation types: list, whole, decimal, date, time, textLength, custom

Operators: between, notBetween, equal, notEqual, greaterThan, lessThan, greaterThanOrEqual, lessThanOrEqual

## Conditional Formatting

```bash
# Data bars (always specify min and max to avoid invalid XML)
officecli add data.xlsx /Sheet1 --type databar --prop sqref="B2:B20" --prop color=4472C4 --prop min=0 --prop max=100000

# Color scale (2-color)
officecli add data.xlsx /Sheet1 --type colorscale --prop sqref="C2:C20" --prop mincolor=FFFFFF --prop maxcolor=4472C4

# Color scale (3-color)
officecli add data.xlsx /Sheet1 --type colorscale --prop sqref="C2:C20" --prop mincolor=FF0000 --prop midcolor=FFFF00 --prop maxcolor=00FF00

# Icon sets
officecli add data.xlsx /Sheet1 --type iconset --prop sqref="D2:D20" --prop iconset=3TrafficLights1

# Formula-based CF
officecli add data.xlsx /Sheet1 --type formulacf --prop sqref="A2:E20" --prop formula='$E2>10000' --prop fill=D9E2F3 --prop font.bold=true
```

Icon set types (17): 3Arrows, 3ArrowsGray, 3Flags, 3TrafficLights1, 3TrafficLights2, 3Signs, 3Symbols, 3Symbols2, 4Arrows, 4ArrowsGray, 4RedToBlack, 4Rating, 4TrafficLights, 5Arrows, 5ArrowsGray, 5Rating, 5Quarters

## Pivot Tables

```bash
officecli add data.xlsx /Sheet1 --type pivottable --prop source="Data!A1:E200" --prop position="H1" --prop rows="Region,Category" --prop values="Amount:sum,Quantity:avg" --prop name="SalesPivot" --prop style=PivotStyleMedium2
```

Default style is `PivotStyleLight16`. Value aggregation functions: sum, count, average, max, min, product, stddev, var.

## AutoFilter

```bash
officecli add data.xlsx /Sheet1 --type autofilter --prop range="A1:F100"
```

## Sparklines

```bash
# Line sparkline
officecli add data.xlsx /Sheet1 --type sparkline --prop cell=G2 --prop range="B2:F2" --prop type=line --prop color=4472C4

# Column sparkline
officecli add data.xlsx /Sheet1 --type sparkline --prop cell=G3 --prop range="B3:F3" --prop type=column --prop color=1F4E79

# With markers
officecli add data.xlsx /Sheet1 --type sparkline --prop cell=G4 --prop range="B4:F4" --prop type=line --prop color=4472C4 --prop markers=true --prop highpoint=FF0000 --prop lowpoint=0000FF
```
