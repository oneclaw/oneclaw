<!-- officecli-pptx reference -->

# QA Checklist

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

## Content QA

```bash
# Extract all text, check for missing content, typos, wrong order
officecli view slides.pptx text
```

> **Note: `view text` does not extract text inside tables.** To verify table content, use
> `officecli get deck.pptx '/slide[N]/table[M]' --json` and check each cell.
> For table-heavy decks (QBRs, technical specs), `view text` alone leaves a QA blind spot.

```bash
# Check for structural and formatting issues automatically
officecli view slides.pptx issues
```

**Note:** `view issues` reports "Slide has no title" for all blank-layout slides. This is expected when using `layout=blank` (the recommended approach for custom designs). These warnings can be safely ignored.

When editing templates, check for leftover placeholder text:

```bash
officecli query slides.pptx 'shape:contains("lorem")'
officecli query slides.pptx 'shape:contains("xxxx")'
officecli query slides.pptx 'shape:contains("placeholder")'
```

## Visual QA

**Use subagents** -- even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes.

```bash
# Render a single slide as SVG for visual inspection
officecli view slides.pptx svg --start 3 --end 3 --browser

# Loop through slides for multi-slide QA
for i in 1 2 3 4 5; do officecli view slides.pptx svg --start $i --end $i > /tmp/slide-$i.svg; done
```

**SVG limitations:** SVG renders only one slide (the first in the `--start`/`--end` range). Gradient backgrounds, charts, and tables are not visible in SVG output. For full-fidelity multi-slide preview including charts and gradients, use HTML mode:

```bash
officecli view slides.pptx html --browser
```

Prompt for visual QA subagent:

```
Visually inspect these slides. Assume there are issues -- find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray on cream background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.
Report ALL issues found.
```

**Editing-specific QA checklist (in addition to the above):**
- [ ] On every template slide (not new blank slides), verify that NO decorative element (`!!`-prefixed shape) overlaps or obscures content text
- [ ] Verify all hero numbers / key metrics are visible (not hidden by card fills or same-color-as-background)
- [ ] On dark background slides, verify chart bars/lines, axis labels, and gridlines are visible

## Validation

```bash
# Schema validation -- must pass before delivery
officecli validate slides.pptx
```

## Pre-Delivery Checklist

Before declaring a presentation complete, verify:

- [ ] **(Hard Rule H7) Speaker notes verification**: use `officecli view deck.pptx annotated` to confirm every content slide (non-cover, non-closing) has a speaker-notes entry. A content slide missing notes is a hard delivery failure.
- [ ] At least one transition style applied (fade for title, push or wipe for content)
- [ ] Alt text on all pictures
- [ ] At least 3 different layout types used across slides
- [ ] No two consecutive slides share the same layout pattern
- [ ] `view issues` "Slide has no title" warnings — **expected and safe to ignore** when using `layout=blank`. All custom designs use blank layout; these warnings are not real issues.
- [ ] **Overflow check (required for every slide)**: for every text box and shape on every slide, confirm `y + height ≤ 19.05cm` (standard widescreen height) and `x + width ≤ 33.87cm` (standard width). If anything overflows, shrink the font or shorten the text — **never rely on truncation**.
- [ ] **Per-card overflow check**: for multi-card layouts (step cards, feature grids, timeline flows), verify `y + height ≤ 19.05cm` on each card individually. Use `officecli get deck.pptx '/slide[N]/shape[M]'` to inspect every card — never estimate from card count, always measure each one.
- [ ] **Agenda consistency**: if there is an Agenda/TOC slide, confirm every section it lists matches the actual slide titles and order exactly, with no missing sections.
- [ ] **Font-size compliance (Hard Rule H4)**: all body text, card body, bullet points, and multi-column content must be ≥ 16pt. Sizes < 16pt are permitted only for: chart axis labels, legends, KPI sublabels (≤5-word captions), and footnotes.

> **Hard Rule H4 clarification**: body text ≥ 16pt, no exceptions. If content doesn't fit,
> the fix is to cut text or split the slide — not shrink the font.
> Permitted < 16pt exceptions: chart axis labels, legends, KPI sublabels (**only ≤5-word captions**, e.g. "Active users", "MoM growth"; full descriptive sentences do not qualify), and footnotes.

- [ ] **No empty placeholders in chart titles**: chart titles must not contain `()`, `[]`, `TBD`, `XXX`, or similar empty placeholders.
      If a title includes dynamic content (such as a `$M` unit), replace it with the actual value during QA.
      Check command: `officecli view slides.pptx text`, then search for `"()"`.

## Verification Loop

1. Generate slides
2. Run `view issues` + `validate` + visual inspection
3. **List issues found** (if none found, look again more critically)
4. Fix issues
5. **Re-verify affected slides** -- one fix often creates another problem
6. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**
