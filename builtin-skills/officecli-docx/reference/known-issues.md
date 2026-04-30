# Known Issues & Workarounds

## Known CLI Bugs

| Issue | Workaround |
|-------|-----------|
| `--prop field=page` silently ignored in `add --type footer` | Use `raw-set` to inject the `<w:fldChar>` PAGE field. See [Headers & Footers](#page-number-field-injection) below. |
| `differentFirstPage=true` unsupported via `set /` | Do NOT use `set / --prop differentFirstPage=true` -- it silently returns "UNSUPPORTED props". Instead, add a `type=first` footer directly; the CLI auto-inserts the required `<w:titlePg/>` XML element. |
| Table `--index` positioning unreliable | After adding a table with `--index`, verify its actual position with `get /body --depth 1`. If misplaced, use `move` to reposition. |
| Table-level `padding` produces invalid XML | `set "/body/tbl[1]" --prop padding=N` generates invalid `tblCellMar` XML that fails schema validation. Apply padding at the cell level instead: `set "/body/tbl[1]/tr[1]/tc[1]" --prop padding.top=40 --prop padding.bottom=40`. |
| Internal hyperlinks not supported via high-level commands | Use `raw-set` to inject `<w:hyperlink w:anchor="bookmarkName">`. See [Raw XML examples](#raw-xml-examples) below. |
| `\mathcal` causes validation errors | `\mathcal` generates invalid `m:scr` XML. Use `\mathit{L}` or plain italic letters instead. |
| Batch intermittent failure (~1-in-15 runs) | Batch operations occasionally fail without a clear cause. If a batch fails, retry once. If it fails again, split into smaller batches or run commands individually. |
| Shell quoting in inline batch JSON | Always pass batch JSON via `--input file.json`. Inline shell constructs (`echo`, here-documents, piping JSON into stdin) introduce platform-specific quoting bugs that break on Windows cmd / PowerShell. Use the `Write` tool to create a JSON file and pass `--input <path>`. |
| Chart series cannot be added after creation | Include all series in the initial `add --type chart` command. `set --prop data=` can only update existing series values, not add new ones. To change series count, delete the chart and recreate it. |
| `chartType=pie`/`doughnut` invisible in LibreOffice PDF | Pie and doughnut charts render without visible slices in LibreOffice PDF export -- only labels and legend appear. Use `chartType=column` or `chartType=bar` as replacements when the output will be a LibreOffice PDF. Both chart types render correctly in Microsoft Word. |
| `view text` shows "1." for all numbered items | This is a display limitation in the CLI's text extraction, not a document defect. The actual numbering in Word is correct. Do not attempt to "fix" this. |

### Page Number Field Injection

The `--prop field=page` flag is silently ignored when adding footers. You must always use the 2-step pattern:

```bash
# Step 1: Add footer with static text only
officecli add doc.docx / --type footer --prop text="Page " --prop type=default --prop alignment=center --prop size=9pt

# Step 2: Inject PAGE field via raw-set
officecli raw-set doc.docx "/footer[1]" \
  --xpath "//w:p" \
  --action append \
  --xml '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
```

When a first-page footer also exists, the default footer becomes `footer[2]`.

Verify with: `officecli get doc.docx "/footer[N]" --depth 3` -- output must show `fldChar` children.

---

## Limitations

These are not bugs -- they are features the CLI does not currently support.

| Limitation | Notes |
|-----------|-------|
| No visual preview for docx | Unlike pptx, there is no rendered preview. Use `view text`, `view annotated`, `view outline`, and `view issues` for verification. |
| Track changes creation requires raw XML | `accept-changes=all` and `reject-changes=all` work, but creating tracked changes (insertions/deletions with author markup) is not supported via high-level commands. Use `raw-set` with `<w:ins>` or `<w:del>` XML. |
| Tab stops may require raw XML | Tab stops are not exposed as high-level properties. Use `raw-set` to append `<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>` to a paragraph's `pPr`. |
| Complex numbering definitions need numId/numLevel | The `listStyle=bullet` and `listStyle=numbered` shortcuts cover simple lists. For multi-level or custom numbering (e.g., "1.1.2"), you need to define numbering via `raw-set` on `/numbering` with specific `numId` and `numLevel` values. |
| Accept/reject changes only supports `all` scope | You cannot accept or reject individual tracked changes -- only `set / --prop accept-changes=all` or `reject-changes=all` is available. |
| Row-level `set` ignores formatting props | Row-level `set` only supports `height`, `height.exact`, `header`, and `c1/c2/c3...` text shortcuts. Properties like `bold`, `shd`, `color`, `font` are silently ignored. Apply formatting at the cell level. |
| Find/replace is substring-based | No whole-word matching. Replacing "ACME" in "ACME Corporation" produces "New Name Corporation". Always review with `view text` after find/replace. |

---

## Raw XML Escape Hatch (L1 / L2 / L3)

When high-level commands cannot achieve what you need, escalate through these levels:

**L1 -- High-level commands** (90% of cases):
`add`, `set`, `get`, `query`, `remove`, `move`, `swap`, `batch`

**L2 -- Batch with selectors** (bulk modifications):
`set doc.docx 'paragraph[style=Heading1]' --prop font=Georgia`

**L3 -- Raw XML** (last resort -- internal hyperlinks, tracked changes, tab stops, complex numbering):
`raw`, `raw-set`, `add-part`

### Raw XML Parts

`/document`, `/styles`, `/numbering`, `/settings`, `/header[N]`, `/footer[N]`, `/comments`, `/chart[N]`

### XPath Namespace Prefixes

| Prefix | Namespace |
|--------|-----------|
| `w` | WordprocessingML (main document) |
| `r` | Relationships |
| `a` | DrawingML |
| `mc` | Markup Compatibility |
| `wp` | Word Drawing |

### raw-set Actions

`append`, `prepend`, `insertbefore`, `insertafter`, `replace`, `remove`, `setattr`

### Raw XML Examples

**View raw XML of a document part:**
```bash
officecli raw doc.docx /document
officecli raw doc.docx /styles
officecli raw doc.docx /numbering
```

**Modify an attribute (e.g., change paragraph alignment):**
```bash
officecli raw-set doc.docx /document \
  --xpath "//w:body/w:p[1]/w:pPr/w:jc" \
  --action setattr \
  --xml "w:val=center"
```

**Append an element (e.g., add tab stops):**
```bash
officecli raw-set doc.docx /document \
  --xpath "//w:body/w:p[1]/w:pPr" \
  --action append \
  --xml '<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>'
```

**Remove an element (e.g., remove a paragraph border causing schema errors):**
```bash
officecli raw-set doc.docx /document \
  --xpath "//w:body/w:p[3]/w:pPr/w:pBdr" \
  --action remove
```

**Internal hyperlink (link to bookmark named "methodology"):**
```bash
officecli raw-set doc.docx /document \
  --xpath "//w:body/w:p[14]" \
  --action append \
  --xml '<w:hyperlink w:anchor="methodology"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>Methodology</w:t></w:r></w:hyperlink>'
```
