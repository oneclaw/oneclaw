# Command Reference

## Batch Mode

Run multiple commands in a single call using a heredoc JSON array:

```bash
cat <<'EOF' | officecli batch doc.docx
[
  {"command":"add","parent":"/body","type":"paragraph","props":{"text":"Hello","bold":true}},
  {"command":"set","path":"/body/tbl[1]/tr[1]/tc[1]","props":{"shd":"1F4E79","color":"FFFFFF"}}
]
EOF
```

**Fields:** `command` (add/set/remove), `parent`/`path`, `type`, `props`, `from`, `index`.

**Chunk size:** Keep batches under 15 operations. Split by section.

---

## Paragraphs & Text

```bash
# Simple paragraph
officecli add doc.docx /body --type paragraph --prop text="Hello world" --prop font=Calibri --prop size=11pt

# Styled paragraph (bold, colored, centered)
officecli add doc.docx /body --type paragraph --prop text="Notice" --prop bold=true --prop color=FF0000 --prop alignment=center

# Heading (requires style defined via /styles first in blank documents)
officecli add doc.docx /body --type paragraph --prop text="Chapter 1" --prop style=Heading1

# Spacing
officecli add doc.docx /body --type paragraph --prop text="Body text" --prop spaceBefore=12pt --prop spaceAfter=6pt --prop lineSpacing=1.15x

# Indent
officecli add doc.docx /body --type paragraph --prop text="Indented" --prop leftIndent=720 --prop firstLineIndent=360

# Hanging indent (bibliographies)
officecli add doc.docx /body --type paragraph --prop text="Author (2025). Title..." --prop leftIndent=720 --prop hangingIndent=720

# Shading (callout box) -- always reliable
officecli add doc.docx /body --type paragraph --prop text="Note: Important." --prop shd=D9EAD3

# Paragraph border (validate after -- may cause schema errors)
officecli add doc.docx /body --type paragraph --prop text="Note" --prop shd=D9EAD3 --prop pbdr.all="single;4;A9D18E;4"

# Page break before paragraph
officecli add doc.docx /body --type paragraph --prop text="New Chapter" --prop style=Heading1 --prop pageBreakBefore=true
```

**WARNING:** `pbdr` may produce schema validation errors. Always `validate` after adding. If it fails, remove with: `raw-set doc.docx /document --xpath "//w:body/w:p[N]/w:pPr/w:pBdr" --action remove`. Use `shd` alone as a safe alternative.

### Code Blocks

No dedicated code type. Use monospace font + shading:

```bash
# Single-line code block
officecli add doc.docx /body --type paragraph \
  --prop text='GET /api/users HTTP/1.1' \
  --prop font='Courier New' --prop size=10pt --prop shd=F5F5F5 --prop indent=720

# Reusable Code style (define once)
officecli add doc.docx /styles --type style \
  --prop name="Code" --prop id=Code --prop type=paragraph \
  --prop font='Courier New' --prop size=10pt --prop shd=F5F5F5 --prop indent=720

# Apply it
officecli add doc.docx /body --type paragraph --prop text='npm install' --prop style=Code
```

**WARNING:** Do NOT use consecutive spaces for indentation inside code text. Use `--prop ind.left=720` instead.

### Paragraph Properties Reference

| Property | Example | Notes |
|---|---|---|
| `text` | `"Hello"` | Paragraph text |
| `font` | `Calibri` | Font family |
| `size` | `11pt` | Font size |
| `bold` | `true` | Bold text |
| `italic` | `true` | Italic text |
| `color` | `FF0000` | Text color (hex, no #) |
| `alignment` | `center` | left, center, right, justify |
| `style` | `Heading1` | Named style |
| `spaceBefore` | `12pt` | Space above |
| `spaceAfter` | `6pt` | Space below |
| `lineSpacing` | `1.15x` | Line spacing multiplier |
| `leftIndent` | `720` | Left indent (twips) |
| `rightIndent` | `720` | Right indent (twips) |
| `firstLineIndent` | `360` | First line indent (twips) |
| `hangingIndent` | `720` | Hanging indent (twips) |
| `shd` | `D9EAD3` | Background shading (hex) |
| `pbdr.all` | `"single;4;A9D18E;4"` | Border: style;width;color;space |
| `pbdr.bottom` | `"single;6;CCCCCC;1"` | Bottom border only |
| `pageBreakBefore` | `true` | Force page break before |
| `keepNext` | `true` | Keep with next paragraph |
| `listStyle` | `bullet` / `numbered` | List formatting |

---

## Runs (Inline Formatting)

```bash
# Add run to existing paragraph
officecli add doc.docx "/body/p[1]" --type run --prop text="bold text" --prop bold=true

# Superscript / subscript
officecli add doc.docx "/body/p[1]" --type run --prop text="2" --prop superscript=true

# Highlighted text
officecli add doc.docx "/body/p[1]" --type run --prop text="highlighted" --prop highlight=yellow

# Small caps
officecli add doc.docx "/body/p[1]" --type run --prop text="Small Caps" --prop smallCaps=true

# Strikethrough
officecli add doc.docx "/body/p[1]" --type run --prop text="deleted" --prop strike=true

# W14 text effects (Word 2010+)
officecli set doc.docx "/body/p[1]/r[1]" --prop textOutline="1pt;4472C4"
officecli set doc.docx "/body/p[1]/r[1]" --prop textFill="FF0000;0000FF"
```

**textFill format:** `"C1;C2[;ANGLE]"` linear gradient, `"radial:C1;C2"` radial, `"COLOR"` solid. Do NOT prefix with `gradient;`.

---

## Lists

```bash
# Bulleted list
officecli add doc.docx /body --type paragraph --prop text="First item" --prop listStyle=bullet

# Numbered list
officecli add doc.docx /body --type paragraph --prop text="Step one" --prop listStyle=numbered

# Remove list style
officecli set doc.docx "/body/p[5]" --prop listStyle=none
```

**WARNING:** `listStyle` is paragraph-level only. Do not set it on a run.

---

## Tables

### Creation & Row Data

```bash
# Create table
officecli add doc.docx /body --type table --prop rows=4 --prop cols=3 --prop width="100%" --prop style=TableGrid

# Set header row text + flag
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1="Metric" --prop c2="Q3" --prop c3="Q4" --prop header=true

# Fill data rows (c1/c2/c3 text shortcuts work at row level)
officecli set doc.docx "/body/tbl[1]/tr[2]" --prop c1="Revenue" --prop c2="$4.2M" --prop c3="$5.1M"

# Add row to existing table
officecli add doc.docx "/body/tbl[1]" --type row --prop c1="New Item" --prop c2="$1.5M" --prop c3="+12%"

# Row height
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop height=480
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop height.exact=480
```

**CRITICAL:** Row-level `set` only supports `height`, `height.exact`, `header`, and `c1/c2/c3...` text shortcuts. It does NOT accept `bold`, `shd`, `color`, or `font`. All formatting must be applied at the cell level.

### Cell Formatting

```bash
# Cell styling (bold, shading, color)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF

# Cell vertical alignment
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop valign=center

# Cell shading (gradient)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "shd=gradient;1F4E79;4472C4;90"

# Cell text direction
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop textDirection=btlr

# Cell padding (individual sides)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop padding.top=40 --prop padding.bottom=40 --prop padding.left=80 --prop padding.right=80
```

**WARNING:** Do NOT use table-level `--prop padding=N`. It generates invalid XML. Apply padding at the cell level.

### Borders

```bash
# Table borders (all sides)
officecli set doc.docx "/body/tbl[1]" --prop border.all="single;4;CCCCCC;0"

# Individual cell borders
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "border.bottom=single;6;1F4E79;0"

# Diagonal cell borders
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "border.tl2br=single;4;000000;0"
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop "border.tr2bl=single;4;000000;0"
```

Border format: `style;width;color;space`

### Merging

```bash
# Vertical merge (span rows)
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop vmerge=restart
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[1]" --prop vmerge=continue

# Horizontal merge (span columns) -- lowercase gridspan
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop gridspan=2
```

---

## Images

```bash
# Inline image
officecli add doc.docx /body --type picture --prop src=photo.jpg --prop width=15cm --prop height=10cm --prop alt="Team photo"

# Image in paragraph (inline with text)
officecli add doc.docx "/body/p[3]" --type picture --prop src=icon.png --prop width=1cm --prop height=1cm --prop alt="Check icon"

# Image from URL
officecli add doc.docx /body --type picture --prop src=https://example.com/logo.png --prop width=5cm --prop height=3cm --prop alt="Logo"

# Floating/anchored image
officecli add doc.docx /body --type picture --prop src=sidebar.png --prop width=5cm --prop height=8cm --prop anchor=true --prop wrap=square --prop alt="Sidebar"

# Image in table cell
officecli add doc.docx "/body/tbl[1]/tr[1]/tc[1]" --type picture --prop src=avatar.jpg --prop width=2cm --prop height=2cm --prop alt="Avatar"

# Replace existing image
officecli set doc.docx "/body/p[5]/r[1]" --prop src=new-photo.jpg
```

---

## Charts

```bash
# Column chart
officecli add doc.docx /body --type chart --prop chartType=column --prop title="Revenue" \
  --prop categories="Q1,Q2,Q3,Q4" --prop series1="2024:42,58,65,78" --prop series2="2025:51,67,74,92" \
  --prop width=15cm --prop height=10cm --prop colors=1F4E79,4472C4 --prop legend=bottom

# Pie chart
officecli add doc.docx /body --type chart --prop chartType=pie --prop title="Market Share" \
  --prop categories="A,B,C" --prop data="Share:40,35,25" --prop colors=1F4E79,4472C4,A9D18E \
  --prop dataLabels=percent --prop legend=right

# Line chart
officecli add doc.docx /body --type chart --prop chartType=line --prop title="Trend" \
  --prop categories="Jan,Feb,Mar" --prop series1="Revenue:10,15,13" --prop legend=bottom

# Bar chart (horizontal)
officecli add doc.docx /body --type chart --prop chartType=bar --prop categories="US,EU,APAC" \
  --prop data="Sales:30,40,25"

# Doughnut chart
officecli add doc.docx /body --type chart --prop chartType=doughnut --prop categories="Complete,Remaining" \
  --prop data="Progress:75,25" --prop colors=2C5F2D,E8E8E8

# Combo chart (bar + line)
officecli add doc.docx /body --type chart --prop chartType=combo --prop categories="Q1,Q2,Q3,Q4" \
  --prop series1="Revenue:100,200,150,300" --prop series2="Growth:10,15,12,25" \
  --prop comboSplit=1 --prop secondary=2

# Radar chart
officecli add doc.docx /body --type chart --prop chartType=radar \
  --prop categories="Quality,Speed,Cost,Innovation,Support" --prop data="Score:8,7,6,9,8"

# Stacked column
officecli add doc.docx /body --type chart --prop chartType=columnStacked \
  --prop categories="Q1,Q2,Q3,Q4" --prop series1="A:10,20,15,25" --prop series2="B:8,12,18,22"

# Scatter chart
officecli add doc.docx /body --type chart --prop chartType=scatter \
  --prop categories="1,2,3,4,5" --prop data="Values:10,25,18,30,22"
```

**Chart types:** column, columnStacked, bar, barStacked, line, lineStacked, pie, pie3d, doughnut, area, areaStacked, scatter, bubble, radar, stock, combo, column3d, bar3d, line3d, area3d

**Series format:** `--prop series1="Name:v1,v2,v3"` for multi-series; `--prop data="Name:v1,v2,v3"` for single-series.

**WARNING:** Series cannot be added after creation. Include all series in the `add` command. To change series, delete and recreate.

**WARNING -- LibreOffice PDF:** Do NOT use `chartType=pie` or `chartType=doughnut` when output will be LibreOffice PDF. Slices render as invisible. Use `column` or `bar` instead. Both work correctly in Microsoft Word.

---

## Equations

```bash
# Display equation (own paragraph)
officecli add doc.docx /body --type equation --prop "formula=E = mc^2" --prop mode=display

# Inline equation (within paragraph)
officecli add doc.docx "/body/p[3]" --type equation --prop "formula=x^2 + y^2 = r^2" --prop mode=inline

# Set equation on existing paragraph
officecli set doc.docx "/body/p[10]" --prop "formula=\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}"

# Inline equation via run
officecli set doc.docx "/body/p[5]/r[2]" --prop "formula=\alpha + \beta = \gamma"
```

**Supported LaTeX subset:** `\frac{}{}`, `\sqrt{}`, `\sum`, `\int`, `\lim`, `\nabla`, `\partial`, Greek letters (`\alpha`, `\beta`, ...), `_` subscript, `^` superscript, `\binom{}{}`, `\rightarrow`, `\pm`, `\times`, `\cdot`, `\infty`, `\begin{pmatrix}...\end{pmatrix}`

**Caveats:**
- `\mathcal` is NOT reliably supported -- generates invalid XML. Use `\mathit{L}` instead.
- Verify with `view text` after adding -- equations show as `[Equation]` markers.
- Equation paragraphs share the paragraph index space and can be accidentally deleted.

---

## Hyperlinks

```bash
# External hyperlink in paragraph
officecli add doc.docx "/body/p[1]" --type hyperlink --prop url=https://example.com --prop text="Visit" --prop font=Calibri --prop size=11pt

# Make existing run a hyperlink
officecli set doc.docx "/body/p[3]/r[1]" --prop link=https://example.com

# Remove hyperlink from run
officecli set doc.docx "/body/p[3]/r[1]" --prop link=none
```

---

## Bookmarks

```bash
# Add bookmark at paragraph
officecli add doc.docx "/body/p[5]" --type bookmark --prop name=chapter1 --prop text="Chapter 1"

# Rename bookmark
officecli set doc.docx "/bookmark[chapter1]" --prop name=intro

# Replace bookmark content
officecli set doc.docx "/bookmark[chapter1]" --prop text="Updated Title"
```

Internal hyperlinks to bookmarks require raw XML -- see Raw XML section.

---

## Footnotes & Endnotes

```bash
# Add footnote to paragraph
officecli add doc.docx "/body/p[3]" --type footnote --prop text="Source: Annual Report 2025"

# Add endnote
officecli add doc.docx "/body/p[5]" --type endnote --prop text="See appendix for methodology"

# Edit existing footnote
officecli set doc.docx "/footnote[1]" --prop text="Updated source reference"
```

---

## Headers & Footers

```bash
# Default header
officecli add doc.docx / --type header --prop text="Acme Corp" --prop type=default --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=right

# First-page header (different from default)
officecli add doc.docx / --type header --prop text="CONFIDENTIAL" --prop type=first --prop bold=true --prop color=FF0000 --prop alignment=center

# Edit header text
officecli set doc.docx "/header[1]" --prop text="Updated Header"
```

Header/footer types: `default`, `first`, `even`

### Footer with Page Number (2-step pattern)

`--prop field=page` is **silently ignored** in `add --type footer`. You must use `raw-set` to inject the PAGE field.

**Simple footer (no first-page suppression):**

```bash
# Step 1: Add footer with static text
officecli add doc.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt

# Step 2: Inject PAGE field via raw-set (footer[1] when no first-page footer)
officecli raw-set doc.docx "/footer[1]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

**First-page suppression (cover page without page number):**

```bash
# Step 1: Empty first-page footer (auto-enables differentFirstPage)
officecli add doc.docx / --type footer --prop type=first --prop text=""

# Step 2: Default footer with static text
officecli add doc.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt

# Step 3: Inject PAGE field (footer[2] = default when first-page footer also exists)
officecli raw-set doc.docx "/footer[2]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

**WARNING:** `set / --prop differentFirstPage=true` is UNSUPPORTED. Adding `type=first` footer is sufficient.

### Composite Footer (Multi-line)

Each `add / --type footer --prop type=default` appends a new paragraph to the same footer region.

```bash
# Line 1: company name (left)
officecli add doc.docx / --type footer --prop type=default \
  --prop text="Acme Corp | Confidential" --prop alignment=left --prop size=9pt

# Line 2: static "Page " text (center)
officecli add doc.docx / --type footer --prop text="Page " \
  --prop type=default --prop alignment=center --prop size=9pt

# Inject PAGE field into the last paragraph of footer
officecli raw-set doc.docx "/footer[1]" \
  --xpath "(//w:p)[last()]" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

Verify with: `officecli get doc.docx "/footer[N]" --depth 3` -- output must show `fldChar` children.

---

## Watermarks

```bash
# Add text watermark
officecli add doc.docx / --type watermark --prop text=DRAFT --prop color=C0C0C0 --prop font=Calibri --prop opacity=0.5 --prop rotation=315

# Modify watermark
officecli set doc.docx /watermark --prop text=CONFIDENTIAL --prop color=FF0000
```

Default rotation is `315` degrees. Use positive values.

---

## Sections & Page Layout

```bash
# Section break (next page)
officecli add doc.docx /body --type section --prop type=nextPage

# Continuous section break
officecli add doc.docx /body --type section --prop type=continuous

# Even/odd page section break
officecli add doc.docx /body --type section --prop type=evenPage

# Set section to landscape
officecli set doc.docx "/section[2]" --prop orientation=landscape --prop pagewidth=15840 --prop pageheight=12240

# Multi-column section
officecli set doc.docx "/section[2]" --prop columns=2 --prop separator=true

# Custom column widths
officecli set doc.docx "/section[2]" --prop columns=2 --prop "colWidths=5400,3600"

# Section margins
officecli set doc.docx "/section[2]" --prop margintop=1440 --prop marginbottom=1440
```

**CRITICAL:** Section properties use **lowercase** names (`pagewidth`, `pageheight`, `margintop`). Document root (`/`) uses **camelCase** (`pageWidth`, `pageHeight`, `marginTop`). Do not confuse the two.

Section break types: `nextPage`, `continuous`, `evenPage`, `oddPage`

---

## Page Breaks

```bash
# Page break (body level -- creates empty paragraph + break)
officecli add doc.docx /body --type pagebreak

# Page break within paragraph
officecli add doc.docx "/body/p[5]" --type break --prop type=page

# Column break
officecli add doc.docx "/body/p[10]" --type break --prop type=column
```

---

## Fields

```bash
# Page number field
officecli add doc.docx "/body/p[1]" --type pagenum

# Page number at body level (creates paragraph)
officecli add doc.docx /body --type pagenum --prop alignment=center

# Total pages field
officecli add doc.docx "/body/p[1]" --type numpages

# Date field
officecli add doc.docx "/body/p[1]" --type date

# Custom date format
officecli add doc.docx "/body/p[1]" --type field --prop instruction=" DATE \\@ \"yyyy-MM-dd\" " --prop text="2026-01-01"

# Author field
officecli add doc.docx "/body/p[1]" --type field --prop fieldType=author
```

---

## Comments

```bash
# Add comment to paragraph
officecli add doc.docx "/body/p[3]" --type comment --prop text="Please review" --prop author="Claude" --prop initials="C"

# Add comment to specific run
officecli add doc.docx "/body/p[3]/r[1]" --type comment --prop text="Is this correct?" --prop author="Claude"
```

---

## Table of Contents

```bash
# Add TOC (use --index 0 to place at top of body)
officecli add doc.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true --index 0

# Modify TOC depth
officecli set doc.docx "/toc[1]" --prop levels="1-4"
```

**RULE:** If a document has 3 or more level-1 headings, you MUST add a TOC.

**Note:** TOC shows as a field code placeholder in `view text`. In Microsoft Word, press F9 to render with page numbers.

---

## Content Controls (SDT)

```bash
# Text content control
officecli add doc.docx /body --type sdt --prop sdtType=text --prop alias="Company" --prop tag=company --prop text="Enter name"

# Rich text
officecli add doc.docx /body --type sdt --prop sdtType=richtext --prop alias="Description" --prop tag=desc --prop text="Enter description"

# Dropdown
officecli add doc.docx /body --type sdt --prop sdtType=dropdown --prop alias="Status" --prop tag=status --prop "items=Draft,In Review,Final"

# Combobox (editable dropdown)
officecli add doc.docx /body --type sdt --prop sdtType=combobox --prop alias="Dept" --prop tag=dept --prop "items=Engineering,Marketing,Sales"

# Date picker
officecli add doc.docx /body --type sdt --prop sdtType=date --prop alias="Due Date" --prop tag=duedate --prop format="MM/dd/yyyy"

# Locked content control
officecli add doc.docx /body --type sdt --prop sdtType=richtext --prop lock=contentlocked --prop text="Protected"

# Inline SDT within paragraph
officecli add doc.docx "/body/p[1]" --type sdt --prop sdtType=text --prop alias="Inline" --prop text="fill in"
```

SDT types: `text`, `richtext`, `dropdown`, `combobox`, `date`

---

## Custom Styles

```bash
# Paragraph style
officecli add doc.docx /styles --type style --prop name="Block Quote" --prop id=BlockQuote --prop type=paragraph \
  --prop basedOn=Normal --prop font=Georgia --prop size=11 --prop italic=true --prop color=555555 \
  --prop leftIndent=720 --prop rightIndent=720 --prop spaceBefore=12pt --prop spaceAfter=12pt

# Character style
officecli add doc.docx /styles --type style --prop name="Emphasis Bold" --prop id=EmphasisBold --prop type=character \
  --prop bold=true --prop color=1F4E79

# Apply style
officecli set doc.docx "/body/p[10]" --prop style=BlockQuote
```

**NOTE:** Blank documents have no formatting for built-in styles (Heading1, etc.). Define heading styles via `/styles --type style` before using `--prop style=Heading1`.

---

## Find/Replace

```bash
# Find and replace in body
officecli set doc.docx / --prop find="2024" --prop replace="2025"

# Find and replace in headers
officecli set doc.docx '/header[1]' --prop find="Company Name" --prop replace="Acme Corp"

# Find and replace everywhere: call twice (body + headers)
officecli set doc.docx / --prop find="old" --prop replace="new"
officecli set doc.docx '/header[1]' --prop find="old" --prop replace="new"
```

**WARNING:** Performs substring matching, not whole-word. Replacing "ACME" in "ACME Corporation" produces "New Name Corporation". Review with `view text` after and run a cleanup pass if needed.

---

## Track Changes

```bash
# Accept all tracked changes
officecli set doc.docx / --prop accept-changes=all

# Reject all tracked changes
officecli set doc.docx / --prop reject-changes=all
```

Creating tracked changes (insertions/deletions with author markup) is NOT supported via high-level commands. Use `raw-set` with XML.

---

## Clone / Remove / Move / Swap

```bash
# Clone a paragraph
officecli add doc.docx /body --from "/body/p[1]"

# Clone a table
officecli add doc.docx /body --from "/body/tbl[1]"

# Remove element
officecli remove doc.docx "/body/p[5]"

# Move element to index 0
officecli move doc.docx "/body/p[5]" --index 0

# Swap two elements
officecli swap doc.docx "/body/p[1]" "/body/p[3]"
```

---

## Bulk Modifications with Query

```bash
# Set font on all Heading1 paragraphs
officecli set doc.docx 'paragraph[style=Heading1]' --prop font=Georgia --prop color=1F4E79

# Bold all paragraphs containing "important"
officecli set doc.docx 'p:contains("important")' --prop bold=true

# Find all images missing alt text
officecli query doc.docx 'image:no-alt'
```

---

## Raw XML (L3 -- Last Resort)

```bash
# View raw XML
officecli raw doc.docx /document
officecli raw doc.docx /styles
officecli raw doc.docx /numbering

# Modify XML attribute
officecli raw-set doc.docx /document --xpath "//w:body/w:p[1]/w:pPr/w:jc" --action setattr --xml "w:val=center"

# Append XML element
officecli raw-set doc.docx /document --xpath "//w:body/w:p[1]/w:pPr" --action append \
  --xml '<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>'

# Remove XML element
officecli raw-set doc.docx /document --xpath "//w:body/w:p[3]" --action remove

# Internal hyperlink (link to bookmark)
officecli raw-set doc.docx /document --xpath "//w:body/w:p[14]" --action append \
  --xml '<w:hyperlink w:anchor="methodology"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>Methodology</w:t></w:r></w:hyperlink>'

# Tracked change (insertion) via raw XML
officecli raw-set doc.docx /document --xpath "//w:body/w:p[5]" --action append \
  --xml '<w:ins w:id="1" w:author="Claude" w:date="2026-03-27T00:00:00Z"><w:r><w:t>inserted text</w:t></w:r></w:ins>'

# Add new document part
officecli add-part doc.docx /document
```

**Raw XML parts:** /document, /styles, /numbering, /settings, /header[N], /footer[N], /comments, /chart[N]

**XPath prefixes:** w (WordprocessingML), r (Relationships), a (DrawingML), mc (Markup Compatibility), wp (Word Drawing)

**raw-set actions:** append, prepend, insertbefore, insertafter, replace, remove, setattr

---

## Document Setup & Metadata

```bash
# Create blank document
officecli create doc.docx

# Open / close (resident mode -- keeps file in memory)
officecli open doc.docx
officecli close doc.docx

# Set metadata
officecli set doc.docx / --prop title="Q4 Report" --prop author="Team Alpha"

# Set page size and margins
officecli set doc.docx / --prop pageWidth=12240 --prop pageHeight=15840 \
  --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440

# Set default font
officecli set doc.docx / --prop defaultFont=Calibri

# Validate document
officecli validate doc.docx
```

### Page Size Reference

| Paper | pageWidth | pageHeight |
|---|---|---|
| US Letter | 12240 | 15840 |
| A4 | 11906 | 16838 |
| Legal | 12240 | 20160 |

Values are in twips (1440 twips = 1 inch, 567 twips = 1 cm).
