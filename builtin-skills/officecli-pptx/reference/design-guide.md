<!-- officecli-pptx reference -->

# Design Guide

## Before Starting

- **Pick a bold, content-informed color palette**: The palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices.
- **Dominance over equality**: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
- **Dark/light contrast**: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: Pick ONE distinctive element and repeat it -- rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

## Color Palettes

Choose colors that match your topic -- don't default to generic blue:

| Theme | Primary | Secondary | Accent | Text | Muted/Caption |
|-------|---------|-----------|--------|------|---------------|
| **Coral Energy** | `F96167` (coral) | `F9E795` (gold) | `2F3C7E` (navy) | `333333` (charcoal) | `8B7E6A` (warm gray) |
| **Midnight Executive** | `1E2761` (navy) | `CADCFC` (ice blue) | `FFFFFF` (white) | `333333` (charcoal) | `8899BB` (slate) |
| **Forest & Moss** | `2C5F2D` (forest) | `97BC62` (moss) | `F5F5F5` (cream) | `2D2D2D` (near-black) | `6B8E6B` (faded green) |
| **Charcoal Minimal** | `36454F` (charcoal) | `F2F2F2` (off-white) | `212121` (black) | `333333` (dark gray) | `7A8A94` (cool gray) |
| **Warm Terracotta** | `B85042` (terracotta) | `E7E8D1` (sand) | `A7BEAE` (sage) | `3D2B2B` (brown-black) | `8C7B75` (dusty brown) |
| **Berry & Cream** | `6D2E46` (berry) | `A26769` (dusty rose) | `ECE2D0` (cream) | `3D2233` (dark berry) | `8C6B7A` (mauve gray) |
| **Ocean Gradient** | `065A82` (deep blue) | `1C7293` (teal) | `21295C` (midnight) | `2B3A4E` (dark slate) | `6B8FAA` (steel blue) |
| **Teal Trust** | `028090` (teal) | `00A896` (seafoam) | `02C39A` (mint) | `2D3B3B` (dark teal) | `5E8C8C` (muted teal) |
| **Sage Calm** | `84B59F` (sage) | `69A297` (eucalyptus) | `50808E` (slate) | `2D3D35` (dark green) | `7A9488` (faded sage) |
| **Cherry Bold** | `990011` (cherry) | `FCF6F5` (off-white) | `2F3C7E` (navy) | `333333` (charcoal) | `8B6B6B` (dusty red) |

Use **Text** for body copy on light backgrounds, **Muted** for captions, labels, and axis text. On dark backgrounds, use the Secondary or `FFFFFF` for body text and Muted for captions.

> **深色背景对比度规则（Hard Rule H6 补充）**：当 slide 背景为深色（填充亮度 < 30%，如 `1E2761`、`36454F`、`000000` 等）时，所有正文文字、卡片 body text、图表系列颜色和图标填充**必须**使用白色（`FFFFFF`）或近白色（亮度 > 80%）。
> **严禁**在深色背景上使用中性灰或低饱和色调（如 `6B7B8D`，亮度约 44%）作为 body text 颜色——这类颜色在深色背景上对比度不足，在演示现场尤为明显。
> 验证方法：在完成深色背景 slide 后，用 `view html --browser` 或视觉 QA 子代理确认所有文字和元素清晰可辨。

**Need a color not in the table?** These palettes are starting points. You can add accent colors (e.g., gold `D4A843` with Forest & Moss) or blend palettes to match the topic. If a user requests a palette that doesn't exist by name (e.g., "Forest & Gold"), use the closest match and supplement with appropriate accent tones.

## Typography

**Choose an interesting font pairing** -- don't default to Arial.

| Header Font | Body Font | Best For |
|-------------|-----------|----------|
| Georgia | Calibri | Formal business, finance, executive reports |
| Arial Black | Arial | Bold marketing, product launches |
| Calibri | Calibri Light | Clean corporate, minimal design |
| Cambria | Calibri | Traditional professional, legal, academic |
| Trebuchet MS | Calibri | Friendly tech, startups, SaaS |
| Impact | Arial | Bold headlines, event decks, keynotes |
| Palatino | Garamond | Elegant editorial, luxury, nonprofit |
| Consolas | Calibri | Developer tools, technical/engineering |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | **16-20pt**（最小 16pt；绝不低于 16pt） |
| Captions | 10-12pt muted |

> **Hard Rule H4**：body text 最低 **16pt**，无任何例外。
> 卡片内正文、多列内容、bullet points 一律不低于 16pt。
> 「内容放不下」不是低于 16pt 的理由——应减少文字、拆分 slide，或减少卡片数量。
> 仅以下非主读元素允许 < 16pt：图表轴标签、图例、脚注、KPI 数字下方的说明标注（sublabel）。
>
> **KPI sublabel 例外的适用范围**：仅限 ≤5 个词的短标注（如 "Active users"、"MoM growth"、"Q3 2025"）。
> 若 sublabel 是完整的描述性句子（如 "Compared to last quarter's baseline figure"），则不适用此例外，必须使用 ≥16pt 正文或删除该文字。

> **Hard Rule H7**：所有内容 slide（非封面、非结尾 slide）**必须**包含演讲者备注（speaker notes）。
> 使用 `officecli add deck.pptx /slide[N] --type notes --prop text="..."` 为每张内容 slide 添加备注。
> 缺少 speaker notes 的内容 slide 是交付硬性失败项。

## Layout Variety

**Every slide needs a non-text visual element** — shape, color block, chart, icon, or graphic. Text-only slides are forgettable and violate delivery standards.

### 无图片场景的视觉设计清单（CLI 限制下的替代方案）

officecli 不依赖外部图片文件即可实现丰富视觉效果。当无可用图片文件时，必须从以下至少一种方式中选取视觉元素：

| 方式 | 实现方法 | 适用场景 |
|------|---------|---------|
| **色块背景** | `--type shape --prop fill=COLOR --prop preset=roundRect` | 卡片、强调区块 |
| **渐变 slide 背景** | `--prop "background=COLOR1-COLOR2-180"` | Section dividers、title slides |
| **Icon in circle** | 彩色 ellipse + 文字/数字居中叠加（见 creating.md）| 功能列表、流程步骤 |
| **大字号统计数字** | `--prop size=64 --prop bold=true`（60-72pt 数字）+ 小标签 | KPI、stats slides |
| **图表** | `--type chart`（column/pie/line 等） | 数据展示 slides |
| **形状组合** | circles + connectors + arrows 构建图表/流程 | 架构图、时间线 |

**强制 checkpoint**：每 3 张 content slide 中，至少 1 张必须包含上述非文字视觉元素（色块/图形/图表）。纯文字 slide 仅允许在以下情况使用：引用（quote）、代码示例（code）、纯表格 slide。

Vary across these layout types:
- Two-column (text left, visual right)
- Icon + text rows (icon in colored circle, bold header, description)
- 2x2 or 2x3 grid (content blocks)
- Half-bleed image (full left/right side) with content overlay
- Large stat callouts (big numbers 60-72pt with small labels below)
- Comparison columns (before/after, pros/cons)
- Timeline or process flow (numbered steps, arrows)

### Content-to-Layout Quick Guide

These are starting points. Adapt based on content density and narrative flow.

| Content Type | Recommended Layout | Why |
|---|---|---|
| Pricing / plan tiers | 2-3 column cards (comparison) | Side-by-side enables instant comparison |
| Team / people | Icon grid or 2x3 cards | Faces/avatars need equal visual weight |
| Timeline / roadmap | Process flow with arrows or numbered steps | Left-to-right communicates sequence |
| Key metrics / KPIs | Large stat callouts (3-4 big numbers) | Big numbers grab attention; labels below |
| Testimonials / quotes | Full-width quote with attribution | Generous whitespace signals credibility |
| Feature comparison | Two-column before/after or table | Parallel structure aids scanning |
| Architecture / system | Shapes + connectors diagram | Spatial relationships need visual expression |
| Financial data | Chart + summary table side-by-side | Chart shows trend; table provides precision |

## Spacing

- 0.5" (1.27cm) minimum margins from slide edges
- 0.3-0.5" (0.76-1.27cm) between content blocks
- Leave breathing room -- don't fill every inch

## Avoid (Common Mistakes)

- **Don't repeat the same layout** -- vary columns, cards, and callouts across slides
- **Don't center body text** -- left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** -- titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** -- pick colors that reflect the specific topic
- **Don't mix spacing randomly** -- choose 0.3" or 0.5" gaps and use consistently
- **Don't style one slide and leave the rest plain** -- commit fully or keep it simple throughout
- **Don't create text-only slides** -- add images, icons, charts, or visual elements
- **Don't forget text box padding** -- when aligning shapes with text edges, set `margin=0` on the text box or offset to account for default padding
- **Don't use low-contrast elements** -- icons AND text need strong contrast against the background
- **NEVER use accent lines under titles** -- these are a hallmark of AI-generated slides; use whitespace or background color instead
