# Visual Design System

Concrete palettes, font pairings, and layout guardrails on top of morph-ppt's base design rules.

## Color Palettes (pick one per deck)

Match the palette to the topic mood — don't default to generic blue.

| Palette                | Primary               | Secondary             | Accent           | Body Text | Muted/Caption |
| ---------------------- | --------------------- | --------------------- | ---------------- | --------- | ------------- |
| **Coral Energy**       | `F96167` (coral)      | `F9E795` (gold)       | `2F3C7E` (navy)  | `333333`  | `8B7E6A`      |
| **Midnight Executive** | `1E2761` (navy)       | `CADCFC` (ice blue)   | `FFFFFF`         | `333333`  | `8899BB`      |
| **Forest & Moss**      | `2C5F2D` (forest)     | `97BC62` (moss)       | `F5F5F5` (cream) | `2D2D2D`  | `6B8E6B`      |
| **Charcoal Minimal**   | `36454F` (charcoal)   | `F2F2F2` (off-white)  | `212121`         | `333333`  | `7A8A94`      |
| **Warm Terracotta**    | `B85042` (terracotta) | `E7E8D1` (sand)       | `A7BEAE` (sage)  | `3D2B2B`  | `8C7B75`      |
| **Berry & Cream**      | `6D2E46` (berry)      | `A26769` (dusty rose) | `ECE2D0` (cream) | `3D2233`  | `8C6B7A`      |
| **Ocean Gradient**     | `065A82` (deep blue)  | `1C7293` (teal)       | `21295C`         | `2B3A4E`  | `6B8FAA`      |
| **Teal Trust**         | `028090` (teal)       | `00A896` (seafoam)    | `02C39A` (mint)  | `2D3B3B`  | `5E8C8C`      |
| **Sage Calm**          | `84B59F` (sage)       | `69A297` (eucalyptus) | `50808E`         | `2D3D35`  | `7A9488`      |
| **Cherry Bold**        | `990011` (cherry)     | `FCF6F5` (off-white)  | `2F3C7E` (navy)  | `333333`  | `8B6B6B`      |

**Rules:**

- One color dominates (60–70% visual weight), 1–2 supporting tones, one accent.
- Light background → Body Text for copy, Muted for captions. Dark background → Secondary or `FFFFFF` for copy, Muted for captions.
- More inspiration in `{baseDir}/../morph-ppt/reference/styles/INDEX.md` (50+ styles by mood). Learn the approach — do not copy coordinates verbatim.

## Font Pairings (pick one per deck)

| Header Font  | Body Font     | Best For                         |
| ------------ | ------------- | -------------------------------- |
| Georgia      | Calibri       | Formal business, finance         |
| Arial Black  | Arial         | Bold marketing, product launches |
| Calibri      | Calibri Light | Clean corporate, minimal         |
| Cambria      | Calibri       | Traditional professional         |
| Trebuchet MS | Calibri       | Friendly tech, startups          |
| Impact       | Arial         | Bold headlines, keynotes         |
| Palatino     | Garamond      | Elegant editorial, luxury        |
| Consolas     | Calibri       | Developer tools, technical       |

## Hard Rules (no exceptions)

- **16pt minimum body text.** All body text, cards, bullets >= 16pt. "Content doesn't fit" is not an excuse — reduce text, split slide, or drop a card. Exceptions: chart axis labels (<=12pt), short sublabels (<=14pt, max 5 words), footnotes.
- **Dark-background contrast.** When background brightness < 30% (e.g. `1E2761`, `36454F`, `000000`), all body text / card content / chart labels / icon fills MUST be white (`FFFFFF`) or near-white (brightness > 80%). Never use mid-gray on dark.
- **Speaker notes required** on every content slide (not title/closing): `officecli add deck.pptx '/slide[N]' --type notes --prop text="..."`.

## Visual Element Checkpoint

**Every 3 content slides, at least 1 must contain a non-text visual element:**

| Visual type            | Implementation                               |
| ---------------------- | -------------------------------------------- |
| Icon in colored circle | ellipse shape + centered text/number overlay |
| Colored block          | `preset=roundRect` with fill                 |
| Large stat number      | `size=64, bold=true` with small label below  |
| Chart                  | `--type chart` (column/pie/line)             |
| Gradient background    | `background=COLOR1-COLOR2-180`               |
| Shape composition      | circles + connectors for diagrams            |

Text-only slides are only allowed for: quotes, code examples, pure tables.
