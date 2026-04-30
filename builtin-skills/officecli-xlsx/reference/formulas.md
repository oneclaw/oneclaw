<!-- officecli: v1.0.23 -->

# Formulas Reference

## Basic Formulas

```bash
# SUM, AVERAGE, COUNT
officecli set data.xlsx "/Sheet1/B14" --prop formula="SUM(B2:B13)"
officecli set data.xlsx "/Sheet1/C14" --prop formula="AVERAGE(C2:C13)"
officecli set data.xlsx "/Sheet1/D14" --prop formula="COUNT(D2:D13)"
```

## Cross-Sheet References

**CRITICAL:** The `!` in `Sheet1!A1` can be corrupted by some shell quoting paths. Cross-platform safe pattern: **write the formula op into a batch JSON file with the Write tool, then pass it via `--input`**. JSON strings are UTF-8 literal; `!` is never re-interpreted.

`xref.json`:

```json
[
  {"command":"set","path":"/Summary/B2","props":{"formula":"Revenue!B14"}}
]
```

```bash
officecli batch data.xlsx --input xref.json
```

This works identically on macOS Terminal, Windows cmd, and PowerShell — no quoting tricks required.

**VERIFY** cross-sheet formulas after setting:

```bash
officecli get data.xlsx "/Summary/B2"
# Must show: formula: Revenue!B14 (no backslash before !)
```

## SUMIF and COUNTIF

```bash
officecli set data.xlsx "/Summary/B5" --prop formula='SUMIF(Data!C2:C100,"North",Data!E2:E100)'
```

## VLOOKUP

```bash
officecli set data.xlsx "/Summary/C2" --prop formula='VLOOKUP(A2,Data!A:E,5,FALSE)'
```

## IFERROR

```bash
# Wrapping for safety
officecli set data.xlsx "/Summary/D2" --prop formula='IFERROR(B2/C2,0)'
```

## Percentage and Array Formulas

```bash
# Percentage formula
officecli set data.xlsx "/PL/D2" --prop formula="C2/B2"

# Array formula (multi-cell calculation)
officecli set data.xlsx "/Sheet1/F2" --prop formula="{SUM(A2:A10*B2:B10)}"
```

## Named Ranges

```bash
# Add a named range
officecli add data.xlsx / --type namedrange --prop name="GrowthRate" --prop ref="Assumptions!B2" --prop comment="Annual growth rate assumption"
officecli add data.xlsx / --type namedrange --prop name="DataRange" --prop ref="Data!A1:E200"

# Get a named range (verify ref value)
officecli get data.xlsx "/namedrange[GrowthRate]"

# Update: remove old range and re-add with new ref
officecli remove data.xlsx "/namedrange[GrowthRate]"
officecli add data.xlsx / --type namedrange --prop name="GrowthRate" --prop ref="Assumptions!B3" --prop comment="Updated growth rate"
```

## Verification

Always verify after setting formulas with `officecli get` — especially cross-sheet references. Check that formula strings show the expected sheet reference without backslash escaping (e.g., `Revenue!B14` not `Revenue\!B14`).
