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

> **Dark background contrast rule (Hard Rule H6 supplement)**: when the slide background is dark (fill luminance < 30%, e.g. `1E2761`, `36454F`, `000000`), all body text, card body text, chart series colors, and icon fills **must** use white (`FFFFFF`) or near-white (luminance > 80%).
> **Never** use neutral gray or low-saturation tones (e.g. `6B7B8D`, ~44% luminance) as body text on dark backgrounds — contrast is insufficient and especially obvious in a live presentation.
> Verification: after finishing a dark-background slide, use `view html --browser` or a visual-QA subagent to confirm all text and elements are clearly readable.

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
| Body text | **16-20pt** (minimum 16pt; never lower) |
| Captions | 10-12pt muted |

> **Hard Rule H4**: body text minimum **16pt**, no exceptions.
> Card body, multi-column content, and bullet points are all ≥ 16pt.
> "Content doesn't fit" is not a reason to drop below 16pt — cut text, split the slide, or reduce card count.
> Only these non-primary elements may be < 16pt: chart axis labels, legends, footnotes, and the sublabel beneath a KPI number.
>
> **Scope of the KPI sublabel exception**: only ≤5-word captions (e.g. "Active users", "MoM growth", "Q3 2025").
> If a sublabel is a full descriptive sentence (e.g. "Compared to last quarter's baseline figure"), the exception does not apply — use ≥16pt body text or remove the text.

> **Hard Rule H7**: every content slide (non-cover, non-closing) **must** include speaker notes.
> Use `officecli add deck.pptx /slide[N] --type notes --prop text="..."` to add notes to each content slide.
> A content slide missing speaker notes is a hard delivery failure.

## Layout Variety

**Every slide needs a non-text visual element** — shape, color block, chart, icon, or graphic. Text-only slides are forgettable and violate delivery standards.

### Visual design checklist for image-free decks (CLI-friendly alternatives)

officecli can produce rich visuals without any external image files. When no image is available, pick at least one of the following:

| Technique | How | Best for |
|------|---------|---------|
| **Color block background** | `--type shape --prop fill=COLOR --prop preset=roundRect` | Cards, emphasis regions |
| **Gradient slide background** | `--prop "background=COLOR1-COLOR2-180"` | Section dividers, title slides |
| **Icon in circle** | Colored ellipse + centered text/number (see creating.md) | Feature lists, process steps |
| **Large stat numbers** | `--prop size=64 --prop bold=true` (60-72pt numbers) + small label | KPI, stats slides |
| **Charts** | `--type chart` (column / pie / line, etc.) | Data slides |
| **Composed shapes** | circles + connectors + arrows to build diagrams/flows | Architecture diagrams, timelines |

**Required checkpoint**: at least 1 of every 3 content slides must include one of the above non-text visual elements (color block / shape / chart). Text-only slides are allowed only for quotes, code examples, or pure tables.

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
