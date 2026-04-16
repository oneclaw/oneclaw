---
name: quality-gates
description: Quality Reviewer — Check Content/Layout/Morph and provide fix guidance
---

# Quality Reviewer

Role: Evaluate the quality of the generated PPT, identify issues, and guide fixes.

Goal: Ensure the delivered PPT has clear content, comfortable layout, and smooth animations.

---

## Content Gate

### Check Criteria

- ✅ 1 headline per slide
- ✅ Title <= 2 lines
- ✅ 3–5 bullet points
- ✅ No long paragraphs
- ✅ Conclusion First (title is an argument, not a topic)

### Common Issues & Fixes

| Issue                                   | Fix                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Title exceeds 2 lines                   | Shorten the text or reduce font size (64pt → 56pt)                        |
| Too many bullet points (>5)             | Merge similar points or split into two slides                             |
| Title is a topic instead of an argument | Rewrite as a conclusion: "Cost reduced by 40%" instead of "Cost Analysis" |
| Long paragraph present                  | Break into 3–5 bullet points, 1–2 lines each                              |

---

## Layout Gate

### Check Criteria

- ✅ Text boxes <= 14 per slide
- ✅ No overlapping text boxes
- ✅ x-coordinates aligned to grid lines
- ✅ scene actors opacity <= 0.12 (background decoration transparency)
- ✅ **Text color has sufficient contrast with background (readability)** ← mandatory check

### Text Readability Check (critical)

**Check Flow**:

1. Get the `color` attribute of each text box
2. Get the background color at the text box's position (slide background or scene actor fill)
3. Determine whether the text color and background color provide sufficient contrast

**Criteria** (using brightness formula):

```
Brightness = (R × 299 + G × 587 + B × 114) / 1000

- Brightness < 128 → Dark background → Text must be light (#FFFFFF)
- Brightness >= 128 → Light background → Text must be dark (#000000 or #333333)
```

**Examples**:

- `#2C3E50` (dark blue) = 62 → Dark → Use white text
- `#E74C3C` (red) = 115 → Dark → Use white text
- `#F39C12` (orange) = 160 → Light → Use black text
- `#FFFFFF` (white) = 255 → Light → Use black text

**Prohibited Errors**:

- ❌ Dark blue text on dark blue background (similar or identical color values)
- ❌ White text on light background (insufficient contrast)
- ❌ Any case where text color = background color

### Common Issues & Fixes

| Issue                             | How to Identify                                             | Fix                                                                               |
| --------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Text color = background color** | Text color and background fill are identical                | Dark background → change text to FFFFFF; Light background → change text to 000000 |
| **Insufficient contrast**         | Text color and background color are both dark or both light | Invert one of them: dark background → white text; light background → black text   |
| **Text wrapping overflow**        | Text box too narrow, text forced to wrap and overflows      | Increase text box width, or reduce text content                                   |
| **Previous slide text residue**   | Previous slide's title has no ghost on the current slide    | Move the unneeded headline/content actor to `x=36cm`                              |
| Text box overlap                  | Two text boxes with overlapping y-coordinates               | Adjust with `officecli set '/shape[N]' --prop y=XXcm`                             |
| x-coordinate not aligned          | x is not a grid multiple                                    | Align to grid: 1.2cm, 2.4cm, 3.6cm...                                             |
| scene actors obscuring text       | Opacity too high (>0.12)                                    | Lower transparency: `--prop opacity=0.08`                                         |
| Too many text boxes (>14)         | Count shapes with type=textbox                              | Merge similar content or simplify descriptions                                    |

---

> **Note:** Morph animation verification is handled by `morph-helpers.py` (`verify` and `final-check` commands) and SKILL.md Phase 4. See `troubleshooting.md` for common morph issues and fixes.
