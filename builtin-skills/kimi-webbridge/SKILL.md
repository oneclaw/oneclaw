---
name: kimi-webbridge
description: |
  Kimi WebBridge lets AI control the user's real browser — navigate, click, type, read, screenshot, and interact with any website using the user's actual login sessions. Use this skill whenever the user wants to interact with websites, automate browser tasks, scrape web content, or perform any action requiring a real browser. Also use when the user mentions "browser", "webpage", "open URL", "screenshot", or asks to read/interact with any website. Use even for simple-sounding browser requests — the daemon handles all complexity.
---

# Kimi WebBridge

Control the user's real browser (with their login sessions) via a local daemon at `http://127.0.0.1:10086`.

## Health check (always do this first)

```bash
~/.kimi-webbridge/bin/kimi-webbridge status
```

Then act on the result:

- **`running: true` and `extension_connected: true`** — healthy. Proceed with the tool calls below.
- **Anything else** (command not found, `running: false`, `extension_connected: false`, errors) — **Read `references/operations.md`** in this skill directory. It has the install / start / diagnose routing table.

Don't guess fixes here — every non-healthy state is handled in `references/operations.md`.

## Tools

| Tool | Args | Returns | Note |
|------|------|---------|------|
| `navigate` | `url`, `newTab`(bool) | `{success, url, tabId}` | Always use `newTab:true` on first call |
| `snapshot` | — | `{url, title, tree}` with `@e` refs | **Accessibility tree** (text) — use this to read page content and locate elements |
| `click` | `selector` (@e ref or CSS) | `{success, tag, text}` | |
| `fill` | `selector`, `value` | `{success, tag}` | |
| `evaluate` | `code` (supports async/await) | `{type, value}` | |
| `screenshot` | `format`(png\|jpeg), `quality`(0-100) | image file path | **Visual capture** (image) — use helper script, see below |
| `network` | `cmd`(start\|stop\|list\|detail), `filter`, `requestId` | request/response data | |
| `upload` | `selector`, `files`(string[]) | `{success, fileCount}` | |

### Call Format

```bash
curl -s -X POST http://127.0.0.1:10086/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"navigate","args":{"url":"https://example.com","newTab":true}}'
```

## Sessions

Each session maps to a separate browser tab group. Use different session names for different sites to keep operations isolated.

Add `"session":"name"` to the request body:

```bash
curl -s -X POST http://127.0.0.1:10086/command \
  -d '{"action":"navigate","args":{"url":"https://example.com","newTab":true},"session":"my-task"}'
```

Always assign distinct session names when working with multiple sites in parallel.

## Screenshots: Use the Helper Script

**Never call the screenshot API directly** — it returns base64-encoded image data (hundreds of KB of text) that will flood the context window.

Use `scripts/screenshot.sh` instead. It decodes and saves the image to disk, returning only the file path:

```bash
# Default — saves to /tmp/kimi-webbridge-screenshots/{timestamp}.png
bash "$(dirname "$SKILL_PATH")/scripts/screenshot.sh"

# With a session
bash "$(dirname "$SKILL_PATH")/scripts/screenshot.sh" -s my-task

# Custom output path
bash "$(dirname "$SKILL_PATH")/scripts/screenshot.sh" -o /tmp/page.png

# JPEG format, quality 60
bash "$(dirname "$SKILL_PATH")/scripts/screenshot.sh" -f jpeg -q 60
```

After getting the file path, use the Read tool to view the image.

If `$SKILL_PATH` is unavailable, call the script by its absolute path.

## Prefer Snapshot Over JS Selectors

When interacting with a page, **always use snapshot first** rather than writing CSS selectors or JS queries:

1. **Locate elements**: snapshot returns interactive elements with `@e` refs — use them directly with click/fill, no need to guess CSS selectors
2. **Detect state changes**: take a snapshot before and after an action, compare the elements to confirm dialogs/panels opened or closed
3. **Extract structured data**: element `name` attributes contain readable text that can be parsed directly
4. **Stability**: relies on semantic role/name attributes, not randomly hashed CSS class names

**Fall back to evaluate (JS) only when**:
- The target element has no `@e` ref in the snapshot
- You need attributes not included in the snapshot (e.g., href URLs)
- You need to dispatch complex event sequences
- Scrolling or other auxiliary operations

### Standard Workflow

```
1. navigate (newTab:true)  →  open the page
2. snapshot                →  get interactive elements, find the target @e ref
3. click @eN               →  click the target
4. snapshot                →  compare elements to confirm the action took effect
5. evaluate                →  extract additional details if snapshot is insufficient
```

## Evaluate Tips

- Always use compact `JSON.stringify(data)` — never add `null, 2` formatting. Indentation and newlines can inflate the response several times over, causing truncation during transmission.

## Version conventions (pre-deliverable; Agents: read-only for now)

The daemon, the Chrome extension, and this skill share a 1:1 version string.
Right now the only binding you need to know is *visibility*; automatic pairing
will land in a later release.

### Where to read versions

```bash
~/.kimi-webbridge/bin/kimi-webbridge status
# → JSON with:
#     "version": "<daemon version>"
#     "extension_version": "<extension version>"  (empty if not connected)
```

### Pin a specific skill version (CLI users)

```bash
~/.kimi-webbridge/bin/kimi-webbridge install-skill --version 0.3.0
```

OSS URL convention: `https://kimi-web-img.moonshot.cn/webbridge/<version>/skills/kimi-webbridge.tar.gz`
(`<version>` may also be `latest`.)

### Guidance for Agents (current iteration)

Do **not** auto-switch skill versions based on `extension_version` yet. The
version pairing protocol isn't finalized. If you hit a `tool not implemented`
error from the daemon, raise it to the user with the `extension_version` and
`version` fields from `status`; they can choose to update.
