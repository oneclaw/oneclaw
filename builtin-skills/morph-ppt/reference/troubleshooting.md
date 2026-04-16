---
name: troubleshooting
description: Morph PPT troubleshooting guide and post-build adjustments
---

# Troubleshooting

## Common Issues

**Missing transition** -- `helper("clone", ...)` already sets it. If `verify` still reports missing:

```bash
officecli get <file>.pptx '/slide[N]' --json | grep transition   # expect "transition": "morph"
officecli set <file>.pptx '/slide[N]' --prop transition=morph    # manual fix
```

**Unghosted `#sN-*` content** -- means the shape was named without the `#sN-` prefix on slide N, so auto-ghost couldn't find it. Fix the naming on slide N and re-run the script.

**Stale `!!actor-*` across a section boundary** -- you forgot `helper("ghost-section", OUTPUT, N)` on the first slide of the new section. Add it and re-run.

**Shapes at wrong positions after clone** -- after `helper("clone", ...)`, shape indices shift because `transition=morph` reorders the shape tree. If you used `/slide[N]/shape[M]` to reposition a scene actor, `shape[M]` may now point to a ghosted content shape, moving it back on-screen and causing overlap. Fix: replace all index-based `run("officecli", "set", ..., "/slide[N]/shape[M]", ...)` with `helper("move", OUTPUT, N, "!!scene-name", "x=...", "y=...")`.

**Visual layout debugging** -- `officecli view <file>.pptx html` opens an HTML preview of the deck.

**Reminder:** `!!scene-*` shapes are *meant* to persist across every slide -- that is not a bug. Only `!!actor-*` and `#sN-*` need to be ghosted.

---

## Adjustments After Creation

When the user requests changes after the deck is built:

| Request | Command |
|---------|---------|
| Swap two slides | `officecli swap deck.pptx '/slide[2]' '/slide[4]'` |
| Move a slide after another | `officecli move deck.pptx '/slide[5]' --after '/slide[2]'` |
| Edit shape text | `officecli set deck.pptx '/slide[N]/shape[@name=!! ShapeName]' --prop text="..."` |
| Change color / style | `officecli set deck.pptx '/slide[N]/shape[@name=!! ShapeName]' --prop fill=FF0000` |
| Remove an element | `officecli remove deck.pptx '/slide[N]/shape[@name=!! ShapeName]'` |
| Find & replace text | `officecli set deck.pptx / --prop find=OldText --prop replace=NewText` |

> **Morph caution:** After swapping or moving slides, verify that morph pairs (same `!!` name on adjacent slides) are still aligned. Use `officecli get deck.pptx '/slide[N]' --depth 1` to inspect shape names.
