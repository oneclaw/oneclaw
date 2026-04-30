# Creating Documents from Scratch

Use this guide when creating a new document with no template.

## Workflow Overview

1. **Create** blank document
2. **Plan** document structure (outline + element types)
3. **Build** incrementally -- run each command and check output before proceeding; use `batch` only for bulk content entry (many paragraphs or table cells at once)
4. **QA** (content + validation) -- see [SKILL.md](../SKILL.md#qa-required)

---

## Setup

```bash
# Create blank document
officecli create doc.docx

# Set metadata
officecli set doc.docx / --prop title="Q4 Report" --prop author="Team Alpha"

# Set page size (US Letter with 1" margins)
officecli set doc.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440

# Set default font
officecli set doc.docx / --prop defaultFont=Calibri
```

### Page Size Reference

| Paper | pageWidth | pageHeight |
|-------|-----------|------------|
| US Letter | 12240 | 15840 |
| A4 | 11906 | 16838 |
| Legal | 12240 | 20160 |

Values are in twips (1440 twips = 1 inch, 567 twips = 1 cm).

---

## Execution Strategy: Batch vs Incremental

**Use INCREMENTAL (one command at a time):**
- `add /styles --type style` -- define all styles before using them; verify they exist
- `add / --type header/footer/watermark/toc` -- structural; verify before building on top
- `add /body --type table/chart` -- creates the container; fill contents after confirming
- `validate` -- always run alone
- **When in doubt** -- a single command gives immediate feedback; if it fails you know exactly where. Batch errors are harder to diagnose.

**Use BATCH (`--input` file):**
- Multiple consecutive `add /body --type paragraph/run` -- body content has no structural side effects
- Bulk list items (bullet points, numbered steps)
- Format painting -- applying the same props to multiple paragraphs or table cells
- Filling table rows with text

The batch flow is always:

1. Use the `Write` tool to create a JSON file (e.g. `chunk-1.json`) containing the ops array.
2. Run `officecli batch doc.docx --input chunk-1.json`.
3. Read the output. If clean, write `chunk-2.json` and repeat.

Do **not** feed batch JSON via shell here-documents, pipes, `echo`, or shell loops — those constructs break on Windows cmd / PowerShell. `--input <file>` is the only cross-platform path.

**Always use `officecli open`/`close`.** It keeps the file in memory so every command skips repeated file I/O. Batch and resident mode are independent: each works on its own, and they can be combined.

**Batch chunk size:** Keep batches under 15 operations for incremental work, up to ~50 ops for pure body content. Split by section (e.g., one batch per heading + its body paragraphs).

For individual command syntax and property details, see [commands.md](../reference/commands.md).

> **Execute recipes below incrementally -- one command (or one `batch --input` invocation) at a time.** Read the output after each command. If a command fails, fix it before continuing. After each structural phase (styles, headers/footers, tables, charts), verify with `validate` or `get` before proceeding.

---

## Recipe: Business Report

```bash
# Create and open (resident mode for many operations)
officecli create report.docx
officecli open report.docx

# Metadata and page setup
officecli set report.docx / --prop title="Q4 Business Report" --prop author="Team Alpha"
officecli set report.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440
officecli set report.docx / --prop defaultFont=Calibri

# Define heading styles (blank documents have no built-in style formatting)
officecli add report.docx /styles --type style --prop name="Heading 1" --prop id=Heading1 --prop type=paragraph --prop font=Calibri --prop size=20pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=24pt --prop spaceAfter=12pt --prop keepNext=true
officecli add report.docx /styles --type style --prop name="Heading 2" --prop id=Heading2 --prop type=paragraph --prop font=Calibri --prop size=13pt --prop bold=true --prop color=2E75B6 --prop spaceBefore=18pt --prop spaceAfter=6pt --prop keepNext=true

# Header with company name (default -- body pages only)
officecli add report.docx / --type header --prop text="Acme Corporation" --prop type=default --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=right

# Step 1: Empty footer for cover page -- adding type=first auto-enables differentFirstPage
# NOTE: Do NOT use `set / --prop differentFirstPage=true` -- UNSUPPORTED on current CLI version
officecli add report.docx / --type footer --prop type=first --prop text=""

# Step 2: Default footer with static "Page " text (--prop field=page is SILENTLY IGNORED -- do not use)
officecli add report.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt --prop font=Calibri

# Step 3: REQUIRED -- inject PAGE field via raw-set (footer[2] = default when first-page footer also exists)
officecli raw-set report.docx "/footer[2]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'

# Watermark
officecli add report.docx / --type watermark --prop text=DRAFT --prop color=C0C0C0 --prop opacity=0.5

# ── Cover Page ──────────────────────────────────────────────────────────────
# Top color accent bar
officecli add report.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop spaceBefore=0pt --prop spaceAfter=0pt --prop size=20pt
# Spacer
officecli add report.docx /body --type paragraph --prop text="" --prop spaceBefore=36pt --prop spaceAfter=0pt

# Company / project name
officecli add report.docx /body --type paragraph --prop text="Acme Corporation" --prop alignment=center --prop size=14pt --prop color=1F4E79 --prop spaceAfter=6pt

# Main title (28-32pt)
officecli add report.docx /body --type paragraph --prop text="Q4 Business Report" --prop alignment=center --prop size=30pt --prop bold=true --prop color=1F4E79 --prop spaceAfter=12pt

# Subtitle / document type (18-20pt)
officecli add report.docx /body --type paragraph --prop text="Fiscal Year 2025 — Annual Performance Review" --prop alignment=center --prop size=18pt --prop color=4472C4 --prop spaceAfter=36pt

# Mid accent bar (visual separator)
officecli add report.docx /body --type paragraph --prop text="" --prop shd=4472C4 --prop spaceBefore=0pt --prop spaceAfter=24pt --prop size=8pt

# Author / department
officecli add report.docx /body --type paragraph --prop text="Prepared by: Team Alpha  |  Finance & Strategy Division" --prop alignment=center --prop size=11pt --prop color=444444 --prop spaceAfter=8pt

# Date
officecli add report.docx /body --type paragraph --prop text="March 2026" --prop alignment=center --prop size=11pt --prop color=444444 --prop spaceAfter=8pt

# Version / confidentiality notice
officecli add report.docx /body --type paragraph --prop text="Version 1.0  |  CONFIDENTIAL" --prop alignment=center --prop size=9pt --prop color=888888 --prop spaceAfter=36pt

# Bottom accent bar + contact info
officecli add report.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop spaceBefore=0pt --prop spaceAfter=6pt --prop size=12pt
officecli add report.docx /body --type paragraph --prop text="contact@acmecorp.com  |  www.acmecorp.com" --prop alignment=center --prop size=9pt --prop color=888888 --prop spaceAfter=0pt

officecli add report.docx /body --type pagebreak

# Table of Contents
officecli add report.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true --index 0

# Title and executive summary
officecli add report.docx /body --type paragraph --prop text="Q4 Business Report" --prop style=Heading1
officecli add report.docx /body --type paragraph --prop text="Executive Summary" --prop style=Heading2
officecli add report.docx /body --type paragraph --prop text="This report summarizes Q4 performance across all divisions. Revenue grew 25% year-over-year while operating costs decreased 12%." --prop font=Calibri --prop size=11pt --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Key highlights (bulleted list)
officecli add report.docx /body --type paragraph --prop text="Key Highlights" --prop style=Heading2
officecli add report.docx /body --type paragraph --prop text="Revenue increased to $5.1M (+25% YoY)" --prop listStyle=bullet
officecli add report.docx /body --type paragraph --prop text="Customer retention rate reached 94%" --prop listStyle=bullet
officecli add report.docx /body --type paragraph --prop text="New market expansion on track for Q1 launch" --prop listStyle=bullet

# Revenue section with table
officecli add report.docx /body --type paragraph --prop text="Revenue Overview" --prop style=Heading2
officecli add report.docx /body --type table --prop rows=4 --prop cols=3 --prop width="100%" --prop style=TableGrid

# Set header row text and flag
officecli set report.docx "/body/tbl[1]/tr[1]" --prop c1="Division" --prop c2="Q3" --prop c3="Q4" --prop header=true

# Style header cells individually (row set does NOT support bold/shd/color)
officecli set report.docx "/body/tbl[1]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set report.docx "/body/tbl[1]/tr[1]/tc[2]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set report.docx "/body/tbl[1]/tr[1]/tc[3]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF

# Fill data rows
officecli set report.docx "/body/tbl[1]/tr[2]" --prop c1="North America" --prop c2="$4.2M" --prop c3="$5.1M"
officecli set report.docx "/body/tbl[1]/tr[3]" --prop c1="Europe" --prop c2="$3.1M" --prop c3="$3.8M"
officecli set report.docx "/body/tbl[1]/tr[4]" --prop c1="APAC" --prop c2="$1.8M" --prop c3="$2.3M"

# Set table borders
officecli set report.docx "/body/tbl[1]" --prop border.all="single;4;CCCCCC;0"

# Column chart
officecli add report.docx /body --type paragraph --prop text="Revenue Trend" --prop style=Heading2
officecli add report.docx /body --type chart --prop chartType=column --prop title="Quarterly Revenue" --prop categories="Q1,Q2,Q3,Q4" --prop series1="2024:42,58,65,78" --prop series2="2025:51,67,74,92" --prop width=15cm --prop height=10cm --prop colors=1F4E79,4472C4 --prop legend=bottom

# Validate and close
officecli validate report.docx
officecli close report.docx
```

---

## Recipe: Formal Letter

```bash
officecli create letter.docx

# Page setup
officecli set letter.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440

# Date
officecli add letter.docx /body --type paragraph --prop text="March 27, 2026" --prop alignment=right --prop spaceAfter=24pt

# Sender address (right-aligned)
officecli add letter.docx /body --type paragraph --prop text="Jane Smith" --prop alignment=right
officecli add letter.docx /body --type paragraph --prop text="Acme Corporation" --prop alignment=right
officecli add letter.docx /body --type paragraph --prop text="123 Business Ave, Suite 400" --prop alignment=right
officecli add letter.docx /body --type paragraph --prop text="New York, NY 10001" --prop alignment=right --prop spaceAfter=24pt

# Recipient address
officecli add letter.docx /body --type paragraph --prop text="John Doe" --prop spaceAfter=0pt
officecli add letter.docx /body --type paragraph --prop text="Partner Corp" --prop spaceAfter=0pt
officecli add letter.docx /body --type paragraph --prop text="456 Commerce St" --prop spaceAfter=0pt
officecli add letter.docx /body --type paragraph --prop text="Chicago, IL 60601" --prop spaceAfter=24pt

# Subject line
officecli add letter.docx /body --type paragraph --prop text="RE: Partnership Agreement Q2 2026" --prop bold=true --prop spaceAfter=12pt

# Body paragraphs
officecli add letter.docx /body --type paragraph --prop text="Dear Mr. Doe," --prop spaceAfter=12pt --prop lineSpacing=1.15x
officecli add letter.docx /body --type paragraph --prop text="Thank you for your continued partnership with Acme Corporation. We are pleased to present the updated terms for our Q2 2026 collaboration agreement." --prop spaceAfter=12pt --prop lineSpacing=1.15x
officecli add letter.docx /body --type paragraph --prop text="As discussed during our March 15th meeting, the revised pricing structure reflects a 10% volume discount applicable to all orders exceeding 500 units per quarter." --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Closing
officecli add letter.docx /body --type paragraph --prop text="Sincerely," --prop spaceAfter=36pt
officecli add letter.docx /body --type paragraph --prop text="Jane Smith" --prop bold=true
officecli add letter.docx /body --type paragraph --prop text="VP of Business Development"

# Footnote
officecli add letter.docx "/body/p[9]" --type footnote --prop text="Volume discount applies to combined orders across all product categories."

officecli validate letter.docx
```

---

## Recipe: Academic/Research Paper

```bash
officecli create paper.docx
officecli open paper.docx

# Page setup
officecli set paper.docx / --prop pageWidth=12240 --prop pageHeight=15840 --prop marginTop=1440 --prop marginBottom=1440 --prop marginLeft=1440 --prop marginRight=1440
officecli set paper.docx / --prop defaultFont=Calibri

# Define heading styles
officecli add paper.docx /styles --type style --prop name="Heading 1" --prop id=Heading1 --prop type=paragraph --prop font=Arial --prop size=20pt --prop bold=true --prop color=000000 --prop spaceBefore=24pt --prop spaceAfter=12pt --prop keepNext=true
officecli add paper.docx /styles --type style --prop name="Heading 2" --prop id=Heading2 --prop type=paragraph --prop font=Arial --prop size=14pt --prop bold=true --prop color=000000 --prop spaceBefore=18pt --prop spaceAfter=6pt --prop keepNext=true

# Define custom styles
officecli add paper.docx /styles --type style --prop name="Abstract" --prop id=Abstract --prop type=paragraph --prop basedOn=Normal --prop font=Calibri --prop size=11 --prop italic=true --prop color=333333 --prop leftIndent=720 --prop rightIndent=720 --prop spaceBefore=12pt --prop spaceAfter=12pt

officecli add paper.docx /styles --type style --prop name="Block Quote" --prop id=BlockQuote --prop type=paragraph --prop basedOn=Normal --prop font=Georgia --prop size=11 --prop italic=true --prop color=555555 --prop leftIndent=720 --prop rightIndent=720 --prop spaceBefore=12pt --prop spaceAfter=12pt

# Title page
officecli add paper.docx /body --type paragraph --prop text="On the Convergence Properties of Iterative Gradient Methods" --prop alignment=center --prop font=Calibri --prop size=18pt --prop bold=true --prop spaceBefore=72pt --prop spaceAfter=24pt

officecli add paper.docx /body --type paragraph --prop text="A. Researcher, B. Scientist" --prop alignment=center --prop size=12pt --prop spaceAfter=6pt
officecli add paper.docx /body --type paragraph --prop text="Department of Mathematics, University of Example" --prop alignment=center --prop size=11pt --prop italic=true --prop spaceAfter=24pt

# Section break after title page
officecli add paper.docx /body --type section --prop type=nextPage

# Step 1: Empty footer for title page -- type=first auto-enables differentFirstPage (no separate set needed)
officecli add paper.docx / --type footer --prop type=first --prop text=""

# Step 2: Default footer (--prop field=page is SILENTLY IGNORED -- add static text only here)
officecli add paper.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt

# Step 3: REQUIRED -- inject PAGE field via raw-set
officecli raw-set paper.docx "/footer[2]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'

# Table of Contents
officecli add paper.docx /body --type toc --prop levels="1-3" --prop title="Table of Contents" --prop hyperlinks=true --prop pagenumbers=true

# Abstract
officecli add paper.docx /body --type paragraph --prop text="Abstract" --prop style=Heading1
officecli add paper.docx /body --type paragraph --prop text="This paper examines convergence properties of gradient descent variants in high-dimensional optimization landscapes. We prove that under mild regularity conditions, the adaptive learning rate achieves optimal convergence rates." --prop style=Abstract

# Introduction with bookmark
officecli add paper.docx /body --type paragraph --prop text="Introduction" --prop style=Heading1
officecli add paper.docx "/body/p[7]" --type bookmark --prop name=introduction

officecli add paper.docx /body --type paragraph --prop text="Gradient-based optimization is fundamental to modern machine learning. Given the objective function, we seek to minimize the expected risk." --prop font=Calibri --prop size=11pt --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Footnote
officecli add paper.docx "/body/p[8]" --type footnote --prop text="See Bottou et al. (2018) for a comprehensive survey of optimization methods."

# Display equation
officecli add paper.docx /body --type equation --prop "formula=x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}" --prop mode=display

# Inline equation in paragraph
officecli add paper.docx /body --type paragraph --prop text="The loss function is defined as " --prop font=Calibri --prop size=11pt
officecli add paper.docx "/body/p[10]" --type equation --prop "formula=L(\theta) = \frac{1}{N}\sum_{i=1}^{N} \ell(f(x_i; \theta), y_i)" --prop mode=inline

# Methods section with bookmark
officecli add paper.docx /body --type paragraph --prop text="Methodology" --prop style=Heading1
officecli add paper.docx "/body/p[11]" --type bookmark --prop name=methodology

officecli add paper.docx /body --type paragraph --prop text="Convergence Analysis" --prop style=Heading2

# Integral equation
officecli add paper.docx /body --type equation --prop "formula=\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}" --prop mode=display

# Endnote
officecli add paper.docx "/body/p[12]" --type endnote --prop text="Full convergence proofs are provided in Appendix A."

# Cross-reference to bookmark (internal hyperlinks require raw XML)
officecli add paper.docx /body --type paragraph --prop text="As established in the Introduction," --prop font=Calibri --prop size=11pt
# NOTE: To make "Introduction" a clickable internal link, use raw-set with w:hyperlink w:anchor="introduction"

# Bibliography with hanging indent
officecli add paper.docx /body --type paragraph --prop text="References" --prop style=Heading1
officecli add paper.docx /body --type paragraph --prop text="Bottou, L., Curtis, F. E., & Nocedal, J. (2018). Optimization methods for large-scale machine learning. SIAM Review, 60(2), 223-311." --prop leftIndent=720 --prop hangingIndent=720 --prop font=Calibri --prop size=11pt --prop spaceAfter=6pt
officecli add paper.docx /body --type paragraph --prop text="Kingma, D. P., & Ba, J. (2015). Adam: A method for stochastic optimization. Proceedings of ICLR." --prop leftIndent=720 --prop hangingIndent=720 --prop font=Calibri --prop size=11pt --prop spaceAfter=6pt

officecli validate paper.docx
officecli close paper.docx
```

---

## Cover Page Design: Content-Rich Standard

> **RULE: The cover page content area must fill at least 60% of the page. Large blank areas are a deliverability defect.**

### Minimum Element Checklist

Every cover page must include these elements (content area must fill >= 60% of the page):

1. Top accent bar (color block)
2. Company / project name (14pt, above title)
3. Main title (28-32pt, bold)
4. Subtitle / document type (18-20pt)
5. Author / department
6. Date
7. Bottom accent bar + contact / version info

Always set `alignment=center` and explicit font sizes on every cover element. Use shading bars to fill visual space and avoid large blank areas.

### Minimum Element Checklist by Document Type

| Document Type | Required Cover Elements |
|---|---|
| **Business Report / Annual Report** | Top accent bar, Company name, Main title (28-32pt), Subtitle/fiscal year (18-20pt), Author/department, Date, Version/confidentiality, Bottom bar + contact |
| **Business Proposal** | Top accent bar, Client name, Proposal title (28-32pt), Prepared-for / prepared-by block, Date, 3-5 bullet key benefits (optional callout), Confidentiality notice |
| **Technical Specification** | Top bar, Product/project name, Document title (28-32pt), Version number + status (DRAFT/FINAL), Author, Date, Target audience, Bottom bar |

### Cover Page Lower Half -- Must Not Be >40% Empty

A common issue is a cover page where the title block ends near the top or middle, leaving the lower half largely blank. This is a deliverability defect. After placing the title/subtitle/author/date block, check whether the lower half is filled. If not, add one or more of the following blocks before the bottom accent bar:

**Option A -- Abstract Excerpt Block** (for reports, technical specs):
```bash
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=EBF3FB --prop size=4pt --prop spaceBefore=0pt --prop spaceAfter=0pt
officecli add doc.docx /body --type paragraph --prop text="ABSTRACT" --prop alignment=center --prop font=Calibri --prop size=9pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=10pt --prop spaceAfter=6pt --prop shd=EBF3FB
officecli add doc.docx /body --type paragraph --prop text="This document presents..." --prop alignment=center --prop font=Calibri --prop size=10pt --prop italic=true --prop color=444444 --prop spaceBefore=0pt --prop spaceAfter=10pt --prop shd=EBF3FB --prop leftIndent=720 --prop rightIndent=720
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=EBF3FB --prop size=4pt --prop spaceBefore=0pt --prop spaceAfter=24pt
```

**Option B -- Document Scope Statement** (for policy, proposal, formal reports):
```bash
officecli add doc.docx /body --type paragraph --prop text="DOCUMENT SCOPE" --prop alignment=center --prop font=Calibri --prop size=9pt --prop bold=true --prop color=888888 --prop spaceBefore=36pt --prop spaceAfter=6pt
officecli add doc.docx /body --type paragraph --prop text="This document applies to all employees of Acme Corporation and covers Q4 2025 fiscal year results." --prop alignment=center --prop font=Calibri --prop size=10pt --prop color=555555 --prop spaceAfter=8pt --prop leftIndent=720 --prop rightIndent=720
```

**Option C -- Key Highlights List** (for annual reports, proposals):
```bash
officecli add doc.docx /body --type paragraph --prop text="KEY HIGHLIGHTS" --prop alignment=center --prop font=Calibri --prop size=9pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=36pt --prop spaceAfter=8pt
officecli add doc.docx /body --type paragraph --prop text="Revenue grew 25% year-over-year" --prop listStyle=bullet --prop font=Calibri --prop size=10pt --prop color=333333 --prop spaceAfter=4pt
officecli add doc.docx /body --type paragraph --prop text="Customer retention reached 94%" --prop listStyle=bullet --prop font=Calibri --prop size=10pt --prop color=333333 --prop spaceAfter=4pt
officecli add doc.docx /body --type paragraph --prop text="Three new markets launched" --prop listStyle=bullet --prop font=Calibri --prop size=10pt --prop color=333333 --prop spaceAfter=24pt
```

> **Rule: Cover page lower half must not be >40% empty.** If your title/author/date block ends in the upper 60% of the page, add Option A, B, or C above before the bottom accent bar.

### Cover Alignment Rule

Every cover page paragraph **must** use `--prop alignment=center` (or `alignment=left` for left-aligned corporate style). Never leave cover text at default paragraph alignment.

### Pitfall: `pbdr` Schema Errors on Cover Elements

If you use paragraph borders (`--prop pbdr.all=...`) on cover elements and validation fails, remove the offending border:
```bash
officecli validate doc.docx
# If a pBdr element causes schema error:
officecli raw-set doc.docx /document --xpath "//w:body/w:p[N]/w:pPr/w:pBdr" --action remove
# Safe alternative: use shd (background shading) alone -- it never causes schema errors.
```

---

## Document Closing Patterns

> **RULE: The last page must have content filling at least 40% of the page. A near-empty final page signals an unfinished document.**

Every professional document needs a deliberate closing section. Never end a document with a sparse final paragraph -- always add one of the following closing patterns.

### Pattern A: Full Closing Section (Recommended for Reports & Proposals)

Include Conclusion / Summary, Next Steps (if applicable), and contact information. This pattern reliably fills the closing page.

```bash
# Conclusion section heading
officecli add doc.docx /body --type paragraph --prop text="Conclusion" --prop style=Heading1

# Conclusion summary text
officecli add doc.docx /body --type paragraph --prop text="This document has outlined the key findings and recommendations for Q4. The data demonstrates strong performance across all divisions, with particular strength in the APAC region." --prop font=Calibri --prop size=11pt --prop spaceAfter=12pt --prop lineSpacing=1.15x

# Next steps (if applicable)
officecli add doc.docx /body --type paragraph --prop text="Next Steps" --prop style=Heading2
officecli add doc.docx /body --type paragraph --prop text="Finalize Q1 budget allocation by April 15" --prop listStyle=numbered
officecli add doc.docx /body --type paragraph --prop text="Present findings to the board on April 20" --prop listStyle=numbered
officecli add doc.docx /body --type paragraph --prop text="Launch APAC expansion pilot in May 2026" --prop listStyle=numbered

# Contact / acknowledgements section
officecli add doc.docx /body --type paragraph --prop text="Contact Information" --prop style=Heading2
officecli add doc.docx /body --type paragraph --prop text="For questions or follow-up, please contact:" --prop font=Calibri --prop size=11pt --prop spaceAfter=6pt
officecli add doc.docx /body --type paragraph --prop text="Team Alpha — Finance & Strategy" --prop font=Calibri --prop size=11pt --prop bold=true --prop spaceAfter=0pt
officecli add doc.docx /body --type paragraph --prop text="Email: team.alpha@acmecorp.com" --prop font=Calibri --prop size=11pt --prop spaceAfter=0pt
officecli add doc.docx /body --type paragraph --prop text="Phone: +1 (212) 555-0100" --prop font=Calibri --prop size=11pt --prop spaceAfter=24pt

# Bottom accent bar + legal notice
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop size=8pt --prop spaceBefore=0pt --prop spaceAfter=8pt
officecli add doc.docx /body --type paragraph --prop text="(c) 2026 Acme Corporation. All rights reserved. This document is confidential and intended solely for the named recipients." --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=center --prop spaceAfter=0pt
```

### Pattern B: Minimal Closing Page (Letters, Memos, Short Reports)

When content naturally ends early, add a "Thank You" close plus contact information to reach the 40% threshold.

```bash
# Closing statement
officecli add doc.docx /body --type paragraph --prop text="Thank You" --prop alignment=center --prop font=Calibri --prop size=24pt --prop bold=true --prop color=1F4E79 --prop spaceBefore=48pt --prop spaceAfter=16pt

# Subtitle line
officecli add doc.docx /body --type paragraph --prop text="We appreciate your time and look forward to the next steps." --prop alignment=center --prop font=Calibri --prop size=12pt --prop color=444444 --prop spaceAfter=36pt

# Accent divider
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=4472C4 --prop size=6pt --prop spaceBefore=0pt --prop spaceAfter=24pt

# Contact block
officecli add doc.docx /body --type paragraph --prop text="contact@acmecorp.com  |  www.acmecorp.com  |  +1 (212) 555-0100" --prop alignment=center --prop font=Calibri --prop size=10pt --prop color=666666 --prop spaceAfter=8pt

# Document version/date footer line
officecli add doc.docx /body --type paragraph --prop text="Document Version 1.0  —  March 2026" --prop alignment=center --prop font=Calibri --prop size=9pt --prop color=AAAAAA --prop spaceAfter=0pt
```

### Pattern C: Appendix + Version History (Technical Spec / Formal Reports)

```bash
# Appendix section
officecli add doc.docx /body --type paragraph --prop text="Appendix" --prop style=Heading1

officecli add doc.docx /body --type paragraph --prop text="A. Glossary" --prop style=Heading2
officecli add doc.docx /body --type paragraph --prop text="API — Application Programming Interface" --prop leftIndent=720 --prop hangingIndent=360 --prop font=Calibri --prop size=11pt --prop spaceAfter=4pt
officecli add doc.docx /body --type paragraph --prop text="CI/CD — Continuous Integration / Continuous Deployment" --prop leftIndent=720 --prop hangingIndent=360 --prop font=Calibri --prop size=11pt --prop spaceAfter=4pt

officecli add doc.docx /body --type paragraph --prop text="B. Version History" --prop style=Heading2
officecli add doc.docx /body --type table --prop rows=4 --prop cols=3 --prop width="100%" --prop style=TableGrid
officecli set doc.docx "/body/tbl[last]/tr[1]" --prop c1="Version" --prop c2="Date" --prop c3="Changes" --prop header=true
officecli set doc.docx "/body/tbl[last]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[last]/tr[1]/tc[2]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[last]/tr[1]/tc[3]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
officecli set doc.docx "/body/tbl[last]/tr[2]" --prop c1="1.0" --prop c2="2026-03-01" --prop c3="Initial draft"
officecli set doc.docx "/body/tbl[last]/tr[3]" --prop c1="1.1" --prop c2="2026-03-15" --prop c3="Review comments incorporated"
officecli set doc.docx "/body/tbl[last]/tr[4]" --prop c1="1.2" --prop c2="2026-03-27" --prop c3="Final approved version"

# Legal notice
officecli add doc.docx /body --type paragraph --prop text="" --prop shd=1F3864 --prop size=8pt --prop spaceBefore=36pt --prop spaceAfter=8pt
officecli add doc.docx /body --type paragraph --prop text="(c) 2026 Acme Corporation. Confidential. Do not distribute without written permission." --prop font=Calibri --prop size=9pt --prop color=888888 --prop alignment=center
```

### Pre-Delivery: Last-Page Density Check

After completing your document, always verify the final page is not sparse:

```bash
# Check total page structure
officecli view doc.docx outline

# Read the last section of content
officecli view doc.docx text --start -30
```

If the last page has fewer than 3-4 substantive paragraphs, add a Closing Pattern (A, B, or C above) before delivering.
