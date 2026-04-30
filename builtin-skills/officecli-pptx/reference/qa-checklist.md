<!-- officecli-pptx reference -->

# QA Checklist

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

## Content QA

```bash
# Extract all text, check for missing content, typos, wrong order
officecli view slides.pptx text
```

> **注意：`view text` 不提取表格 (table) 内的文本。** 如需验证表格内容，请使用
> `officecli get deck.pptx '/slide[N]/table[M]' --json` 检查各单元格内容。
> 对于 QBR、技术规范等大量使用表格的幻灯片，仅靠 `view text` 会产生 QA 盲区。

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

- [ ] **（Hard Rule H7）Speaker notes 验证**：使用 `officecli view deck.pptx annotated` 确认每张内容 slide（非封面、非结尾）均有 speaker notes 条目。缺少 notes 的内容 slide 是交付硬性失败项。
- [ ] At least one transition style applied (fade for title, push or wipe for content)
- [ ] Alt text on all pictures
- [ ] At least 3 different layout types used across slides
- [ ] No two consecutive slides share the same layout pattern
- [ ] `view issues` "Slide has no title" warnings — **expected and safe to ignore** when using `layout=blank`. All custom designs use blank layout; these warnings are not real issues.
- [ ] **溢出检查（每张 slide 必做）**：对每张 slide 上的所有文字框和形状，确认 `y + height ≤ 19.05cm`（标准 widescreen 高度）且 `x + width ≤ 33.87cm`（标准宽度）。如有溢出，调小字号或缩短文本，**不得依赖截断**。
- [ ] **卡片布局逐格溢出检查**：对多卡片布局（step cards、feature grids、timeline flows），逐张卡片验证 `y + height ≤ 19.05cm`。使用 `officecli get deck.pptx '/slide[N]/shape[M]'` 逐一检查每张卡片——不得基于卡片数量估算，必须逐格测量。
- [ ] **Agenda 一致性**：如有 Agenda/TOC slide，确认其列出的所有 section 与实际 slide 标题和顺序完全一致，不得遗漏任何 section。
- [ ] **字号合规（Hard Rule H4）**：所有 body text、卡片正文、bullet points、多列内容的字号 ≥ 16pt。允许 < 16pt 的例外仅限：图表轴标签、图例、KPI sublabel（≤5 词的短标注）、脚注。

> **Hard Rule H4 澄清**：body text ≥ 16pt 无例外。若内容放不下，
> 解决方案是减少文字或拆分 slide，而非缩小字号。
> 允许 < 16pt 的例外：图表轴标签、图例、KPI sublabel（**仅限 ≤5 词的短标注**，如 "Active users"、"MoM growth"；完整描述性句子不适用此例外）、脚注。

- [ ] **图表标题无空占位符**：所有图表标题不得含有 `()`、`[]`、`TBD`、`XXX` 等空占位符。
      若标题包含动态内容（如单位 `$M`），必须在 QA 阶段替换为实际值。
      检查命令：`officecli view slides.pptx text` 然后搜索 `"()"`.

## Verification Loop

1. Generate slides
2. Run `view issues` + `validate` + visual inspection
3. **List issues found** (if none found, look again more critically)
4. Fix issues
5. **Re-verify affected slides** -- one fix often creates another problem
6. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**
