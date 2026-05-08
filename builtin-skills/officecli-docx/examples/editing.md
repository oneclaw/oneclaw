# Editing Existing Documents

Use this guide when modifying an existing .docx file -- template-based updates, content refreshes, or structural reorganization.

For detailed command syntax and property lists, see [commands.md](../reference/commands.md). For the QA checklist, see [SKILL.md](../SKILL.md#qa-required).

---

## Workflow Overview

1. **Analyze** -- understand the document's structure, styles, and content before touching anything
2. **Plan content mapping** -- decide what stays, what changes, what gets added or removed
3. **Structural changes** -- add/remove/reorder sections and paragraphs (**always do this first**)
4. **Content edits** -- update text, tables, images, charts, headers/footers
5. **QA** -- verify content + run validation ([SKILL.md](../SKILL.md#qa-required))

---

## Analyzing the Document

Run these commands in order before making any changes.

### Step 1: Issue Detection

```bash
officecli view doc.docx issues
```

Start here to understand existing problems. Don't introduce new issues on top of old ones.

### Step 2: Structure Overview

```bash
officecli view doc.docx outline
```

Note the heading hierarchy, section count, and whether headers/footers are present.

### Step 3: Content Extraction

```bash
officecli view doc.docx text
officecli view doc.docx text --max-lines 100    # large documents
officecli view doc.docx annotated               # formatting details
```

### Step 4: Style & Font Analysis

```bash
officecli view doc.docx stats
```

Understand the document's style palette. You will need to match existing styles rather than introducing inline formatting.

### Step 5: Element Inspection

```bash
officecli get doc.docx /body --depth 1          # body children with indices
officecli get doc.docx "/body/tbl[1]" --depth 3 # specific table
officecli get doc.docx /styles                  # style definitions
officecli get doc.docx "/header[1]"             # header content
officecli get doc.docx "/footer[1]"             # footer content
```

### Step 6: Find Specific Elements

```bash
officecli query doc.docx 'paragraph[style=Heading1]'
officecli query doc.docx 'p:contains("quarterly")'
officecli query doc.docx 'image:no-alt'
officecli query doc.docx 'p:empty'
```

---

## Planning Content Mapping

Before editing, build a source/action table. This prevents accidental overwrites and keeps the edit session focused.

```
Source content              Action
--------------              ------
Title paragraph          -> Update text
Executive summary        -> Rewrite paragraph content
Revenue table            -> Update data in rows 2-4
Q3 chart                 -> Delete and recreate with Q4 data
Header                   -> Update company name
Footer                   -> Keep (page numbers)
Appendix section         -> Remove entirely
New conclusions section  -> Add after main body
```

Separate structural changes (add/remove/reorder) from content edits (update text/data). Execute structural changes first.

---

## Structural Changes (Do First)

**Complete ALL structural changes before editing content.** Structural operations shift element indices, which invalidates any paths you noted during analysis.

### Adding Elements

```bash
# Add paragraph at a specific position
officecli add doc.docx /body --type paragraph --prop text="New section" --prop style=Heading1 --index 5

# Add section break
officecli add doc.docx /body --type section --prop type=nextPage --index 12
```

### Removing Elements

**Remove from highest index to lowest** to avoid index shifting within the same batch:

```bash
# Correct order -- highest first
officecli remove doc.docx "/body/p[15]"
officecli remove doc.docx "/body/p[10]"

# WRONG -- after removing p[10], what was p[15] is now p[14]
# officecli remove doc.docx "/body/p[10]"
# officecli remove doc.docx "/body/p[15]"   <-- targets wrong element
```

### Reordering Elements

```bash
officecli move doc.docx "/body/p[8]" --index 2
officecli move doc.docx "/body/p[8]" --after "/body/p[2]"
officecli swap doc.docx "/body/p[3]" "/body/p[7]"
```

### Re-query After Every Structural Change

After any add/remove/move, indices shift. Always re-query before the next operation:

```bash
officecli get doc.docx /body --depth 1
```

---

## Content Editing

Once all structural changes are complete and you have re-queried to confirm current indices, proceed with content edits.

### Modifying Text

```bash
officecli set doc.docx "/body/p[1]" --prop text="Updated Title"
officecli set doc.docx "/body/p[3]" --prop text="New body content" --prop font=Calibri --prop size=11pt
officecli set doc.docx "/body/p[3]/r[2]" --prop text="modified phrase" --prop bold=true
```

### Updating Tables

```bash
# Row-level: text shortcuts only
officecli set doc.docx "/body/tbl[1]/tr[2]" --prop c1="Updated" --prop c2="$5.5M" --prop c3="$6.2M"

# Cell-level: formatting
officecli set doc.docx "/body/tbl[1]/tr[2]/tc[3]" --prop text="$6.2M" --prop bold=true --prop color=2C5F2D

# Add a new row
officecli add doc.docx "/body/tbl[1]" --type row --prop c1="Totals" --prop c2="$10.5M" --prop c3="$12.1M"

# Format the new row's cells individually
officecli set doc.docx "/body/tbl[1]/tr[5]/tc[1]" --prop bold=true
officecli set doc.docx "/body/tbl[1]/tr[5]/tc[2]" --prop bold=true
officecli set doc.docx "/body/tbl[1]/tr[5]/tc[3]" --prop bold=true

# Remove a row
officecli remove doc.docx "/body/tbl[1]/tr[5]"
```

### Replacing Images

```bash
officecli set doc.docx "/body/p[5]/r[1]" --prop src=new-image.jpg
officecli set doc.docx "/body/p[5]/r[1]" --prop width=12cm --prop height=8cm
officecli set doc.docx "/body/p[5]/r[1]" --prop alt="Updated chart screenshot"
```

### Updating Headers/Footers

```bash
officecli set doc.docx "/header[1]" --prop text="New Company Name" --prop font=Calibri --prop size=9pt
officecli set doc.docx "/footer[1]" --prop text="Confidential - Page "
```

### Updating Charts

```bash
# Update existing series data
officecli set doc.docx "/chart[1]" --prop data="2025:51,67,74,92"
officecli set doc.docx "/chart[1]" --prop title="Updated Revenue Trend"
officecli set doc.docx "/chart[1]" --prop categories="Q1,Q2,Q3,Q4"
```

To change the number of series, delete and recreate the chart -- `set --prop data=` can only update existing series, not add new ones. See [commands.md](../reference/commands.md) for full chart creation syntax.

### Find/Replace

```bash
# Body text
officecli set doc.docx / --prop find="2024" --prop replace="2025"

# Headers/footers (separate call)
officecli set doc.docx '/header[1]' --prop find="Company Name" --prop replace="Acme Corp"
```

Find/replace performs **substring matching**, not whole-word. "ACME" in "ACME Corporation" becomes "New Name Corporation". After any find/replace, review with `view text` and run a second cleanup pass if needed.

### Accepting/Rejecting Tracked Changes

```bash
officecli set doc.docx / --prop accept-changes=all
officecli set doc.docx / --prop reject-changes=all
```

Only `all` is supported. Selective acceptance by author or range is not available.

### Updating Metadata

```bash
officecli set doc.docx / --prop title="Updated Report Title" --prop author="New Author" --prop lastModifiedBy="Editor"
```

---

## Template Editing Pitfalls

These are the most common sources of broken output when editing existing documents.

### Index Shifting

**The single most common editing mistake.** When you remove `/body/p[5]`, what was `p[6]` becomes `p[5]`. All subsequent indices shift down.

Rules:
- Complete ALL structural changes (add/remove/move) before any content edits
- When removing multiple elements, remove from **highest index to lowest**
- After any structural change, re-query with `get /body --depth 1` to confirm current indices
- Never cache indices across structural operations

### Row-Level Formatting

Row-level `set` supports ONLY these properties: `height`, `height.exact`, `header`, and `c1`/`c2`/`c3`... text shortcuts.

Properties like `bold`, `shd`, `color`, `font`, and `alignment` are **silently ignored** at row level. All formatting must target individual cells:

```bash
# WRONG -- bold and shd silently ignored
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1="Header" --prop bold=true --prop shd=1F4E79

# CORRECT -- text at row level, formatting at cell level
officecli set doc.docx "/body/tbl[1]/tr[1]" --prop c1="Header"
officecli set doc.docx "/body/tbl[1]/tr[1]/tc[1]" --prop bold=true --prop shd=1F4E79 --prop color=FFFFFF
```

### Style Drift

Before adding or modifying content, check existing styles:

```bash
officecli view doc.docx stats
officecli get doc.docx /styles
```

Use existing style names (`--prop style=Heading1`) instead of manually setting font/size/color. If the document uses `Heading1` with Georgia 16pt, applying the style preserves visual consistency. Inline formatting overrides styles and creates maintenance problems.

### Overwriting Headers/Footers

Setting a header replaces its entire content. Documents can have separate first-page and default headers -- setting the default does not affect the first-page header (and vice versa). Always check which header types exist before editing:

```bash
officecli get doc.docx "/header[1]"
```

---

## Bulk Modifications with Query

Use query selectors to target multiple elements at once:

```bash
# Set font on all Heading1 paragraphs
officecli set doc.docx 'paragraph[style=Heading1]' --prop font=Georgia --prop color=1F4E79

# Bold all paragraphs containing specific text
officecli set doc.docx 'p:contains("important")' --prop bold=true

# Find empty paragraphs for review
officecli query doc.docx 'p:empty'
```
