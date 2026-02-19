# OneClaw — Electron Shell for openclaw

## What This Project Is

OneClaw is a cross-platform desktop app that wraps the [openclaw](https://github.com/anthropics/claude-code) gateway into a standalone installable package. It ships a bundled Node.js 22 runtime and the openclaw npm package, so users need zero dev tooling — just install and run.

**Three-process architecture:**

```
Electron Main Process
  ├── Gateway child process  (Node.js 22 → openclaw entry.js, port 18789)
  └── BrowserWindow          (loads http://127.0.0.1:18789 Control UI)
```

The main process spawns a gateway subprocess, waits for its health check, then opens a BrowserWindow pointing at the gateway's local web UI. A system tray icon keeps the app alive when all windows are closed.

## Tech Stack

| Layer | Choice |
|---|---|
| Shell | Electron 40.2.1 |
| Language | TypeScript → CommonJS (no ESM) |
| Packager | electron-builder 26.7.0 |
| Updater | electron-updater (generic provider, CDN at `oneclaw.cn`) |
| Targets | macOS DMG + ZIP (arm64/x64), Windows NSIS (x64/arm64) |
| Version scheme | Calendar-based: `2026.2.13` (auto-fetched from openclaw npm at build time) |

## Repository Layout

```
oneclaw/
├── src/                    # 16 TypeScript modules (2367 LOC total)
│   ├── main.ts             # App entry, lifecycle, IPC registration, Dock toggle, menu
│   ├── constants.ts        # Path resolution (dev vs packaged), health check params
│   ├── gateway-process.ts  # Child process state machine + diagnostics
│   ├── gateway-auth.ts     # Auth token read/generate/persist
│   ├── window.ts           # BrowserWindow lifecycle, token injection, retry
│   ├── window-close-policy.ts  # Close behavior: hide vs destroy
│   ├── tray.ts             # System tray icon + i18n context menu
│   ├── preload.ts          # contextBridge IPC whitelist (15 methods + 2 listeners)
│   ├── provider-config.ts  # Provider presets, verification, config R/W
│   ├── setup-manager.ts    # Setup wizard window lifecycle
│   ├── setup-ipc.ts        # Setup validation + config write + Feishu channel
│   ├── settings-ipc.ts     # Settings provider/channel CRUD, Doctor runner
│   ├── analytics.ts        # Telemetry (PostHog-style, retry + fallback URL)
│   ├── auto-updater.ts     # electron-updater wrapper + progress callback
│   └── logger.ts           # Dual-write logger (file + console)
├── setup/                  # Setup wizard frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # 3-step wizard with data-i18n attributes
│   ├── setup.css           # Dark/light theme via prefers-color-scheme
│   └── setup.js            # i18n dict (en/zh) + form logic + Feishu channel
├── settings/               # Settings page frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # Provider config + channel tabs + Doctor
│   ├── settings.css        # Dark/light theme via prefers-color-scheme
│   └── settings.js         # Provider CRUD, channel management, Doctor stream
├── scripts/
│   ├── package-resources.js    # Downloads Node.js 22 + installs openclaw from npm
│   ├── afterPack.js            # electron-builder hook: injects resources post-strip
│   ├── run-mac-builder.js      # macOS build wrapper (sign + notarize)
│   ├── run-with-env.js         # .env loader for child processes
│   ├── merge-release-yml.js    # Merges per-arch latest.yml for auto-updater
│   ├── dist-all-parallel.sh    # Parallel cross-platform build
│   └── clean.sh
├── assets/                 # Icons: .icns, .ico, .png, tray templates
├── .github/workflows/      # CI: build-release.yml (4-target parallel build + CDN upload)
├── electron-builder.yml    # Build config (DMG + ZIP for mac, NSIS for win)
├── tsconfig.json           # target ES2022, module CommonJS
└── .env                    # Signing keys + analytics config (gitignored)
```

**Generated at build time (all gitignored):**

```
resources/targets/<platform-arch>/   # Per-target Node.js + gateway deps
  ├── runtime/node[.exe]             # Node.js 22 binary
  ├── gateway/                       # openclaw production node_modules
  └── .node-stamp                    # Incremental build marker
dist/                                # tsc output
out/                                 # electron-builder output (DMG/NSIS)
.cache/node/                         # Downloaded Node.js tarballs
```

## Build Commands

```bash
npm run build                # TypeScript → dist/
npm run dev                  # Run in dev mode (electron .)
npm run package:resources    # Download Node.js 22 + install openclaw from npm
npm run dist:mac:arm64       # Full pipeline: package → DMG + ZIP (arm64)
npm run dist:mac:x64         # Same for x64
npm run dist:win:x64         # Windows NSIS x64 (cross-compile from macOS works)
npm run dist:win:arm64       # Windows NSIS arm64
npm run dist:all:parallel    # Build all 4 targets in parallel
npm run clean                # Remove all generated files
```

**Full build pipeline** (what `dist:mac:arm64` does):
1. `package:resources` — download Node.js 22, `npm install openclaw --production --install-links` (version auto-fetched from npm)
2. `tsc` — compile TypeScript
3. `electron-builder` → `afterPack.js` injects `resources/targets/<target>/` into app bundle → DMG/ZIP/NSIS

## Key Design Decisions

### Gateway Child Process (`gateway-process.ts`)

State machine: `stopped → starting → running → stopping → stopped`

Startup sequence:
1. Inject env vars: `OPENCLAW_LENIENT_CONFIG=1`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_NPM_BIN`
2. Prepend bundled runtime to `PATH`
3. Spawn: `<node> <entry.js> gateway run --port 18789 --bind loopback`
4. Poll `GET http://127.0.0.1:18789/` every 500ms, 90s timeout
5. Verify child PID is still alive (avoid port collision false positives)

Main process retries gateway startup **3 times** before showing an error dialog. This covers Windows cold-start slowness (Defender scanning, disk warmup).

All stdout/stderr is captured to `~/.openclaw/gateway.log` for diagnostics.

### Token Injection (`window.ts`)

The gateway requires an auth token. The main process generates one (or reads from config), passes it to the gateway via env var, and injects it into the BrowserWindow via `executeJavaScript`:

```js
localStorage.setItem("openclaw.control.settings.v1", JSON.stringify({token}))
```

### Provider Configuration (`provider-config.ts`)

Centralized module for all provider presets, API key verification, and config file I/O. Shared by both Setup wizard and Settings page.

Supported providers:
- **Anthropic** — standard Anthropic Messages API
- **Moonshot** — 3 sub-platforms: `moonshot-cn`, `moonshot-ai`, `kimi-code`
- **OpenAI** — OpenAI completions API
- **Google** — Google Generative AI
- **Custom** — user-supplied base URL + API type

All sub-platforms (including Kimi Code) use a unified config format: `apiKey` + `baseUrl` + `api` + `models` written to `models.providers`.

### Setup Wizard (`setup-ipc.ts`, `setup/`)

First-launch 3-step wizard: Welcome → Provider Config → Done.

Also supports optional Feishu channel configuration (appId + appSecret).

Config is written to `~/.openclaw/openclaw.json`. Setup completion is marked by `config.wizard.lastRunAt`.

### Settings Page (`settings-ipc.ts`, `settings/`)

Post-setup configuration management with:
- **Model tab** — View/edit provider config, verify API key, switch models
- **Chat Channel tab** — Feishu integration (appId + appSecret)
- **Doctor** — Run `openclaw doctor --non-interactive --repair` with streamed output
- **Restart Gateway** — Apply config changes without app restart

Opened inside the main Chat UI (embedded settings view) via tray menu "Settings" or macOS `Cmd+,` keyboard shortcut.

### macOS Dock Visibility (`main.ts`)

Dynamic Dock icon toggle: visible when any window is shown, hidden when all windows are closed (pure tray mode). Driven by `browser-window-created` + `show`/`hide`/`closed` events.

### Tray i18n (`tray.ts`)

Tray context menu labels are localized (Chinese/English) based on `app.getLocale()`. Menu includes: Open Dashboard, Gateway status, Restart Gateway, Settings, Check for Updates, Quit.

### Auto-Updater (`auto-updater.ts`)

CDN-based updates via `electron-updater`:
- macOS requires ZIP artifact (DMG is for manual distribution)
- Auto-check every 4 hours (30s startup delay)
- Download progress shown in tray tooltip
- Pre-quit callback ensures window close policy doesn't block `quitAndInstall()`

### Incremental Resource Packaging (`package-resources.js`)

A stamp file (`resources/targets/<target>/.node-stamp`) records `version-platform-arch`. If stamp matches, skip download. Cross-platform builds (e.g., building win32-x64 on darwin-arm64) auto-detect the mismatch and re-download.

openclaw is installed directly from npm (no local upstream directory needed). Node.js download mirrors: npmmirror.com (China) first, nodejs.org fallback.

### afterPack Hook (`afterPack.js`)

electron-builder strips `node_modules` during packaging. The afterPack hook injects the pre-built gateway resources from `resources/targets/<target>/` into the final app bundle **after** stripping, bypassing the strip logic entirely.

Target ID resolution: env `ONECLAW_TARGET` > `${electronPlatformName}-${arch}`.

### Preload Security (`preload.ts`)

Electron 40 defaults to sandbox mode. 15 IPC methods + 2 event listeners are exposed via `contextBridge`:

**Gateway control:** `restartGateway`, `getGatewayState`
**Auto-update:** `checkForUpdates`
**Setup:** `verifyKey`, `saveConfig`, `saveChannelConfig`, `completeSetup`
**Settings:** `settingsGetConfig`, `settingsVerifyKey`, `settingsSaveProvider`, `settingsGetChannelConfig`, `settingsSaveChannel`, `settingsRestartGateway`, `settingsRunDoctor`
**Doctor stream:** `onDoctorOutput`, `onDoctorExit` (event listeners)
**Utility:** `openExternal`

`openExternal` exists because `shell.openExternal` is unavailable in sandboxed preload — must go through IPC to main process.

## Runtime Paths (on user's machine)

```
~/.openclaw/
  ├── openclaw.json     # User config (provider, model, auth token, channels)
  ├── .device-id        # Analytics device ID (UUID)
  ├── app.log           # Application log (5MB truncate)
  └── gateway.log       # Gateway child process diagnostic log
```

## Design Rules

1. **Theme color is red, not blue or green.** Use OpenClaw's signature red (`#c0392b`) as the accent/theme color. Never use blue (`#3b82f6`) or green as accent colors. Semantic status colors (error red, warning amber) are separate from the accent.

2. **No `text-transform: uppercase` on labels.** Labels should display as written — respect the original casing of brand names (Chrome, iMessage) and CJK text.

3. **Use iOS-style Switch for boolean settings**, not radio buttons or checkboxes. Follow the Apple-like toggle pattern (`toggle-switch`): label on the left, switch on the right.

4. **Default action buttons align right.** In settings pages, action rows should right-align buttons by default (`.btn-row { justify-content: flex-end; }`) for a consistent visual rhythm. Only deviate when an inline/list context explicitly requires local actions.

## Common Gotchas

1. **`npm install file:` creates symlinks, not copies.** Always use `--install-links` for physical copy. This is critical for electron-builder packaging.

2. **Cross-platform build needs re-packaging.** After switching target platform, `npm run package:resources` must run again because the Node.js binary and native modules differ per platform.

3. **All Moonshot sub-platforms use unified config.** All three (moonshot-cn, moonshot-ai, kimi-code) write `apiKey` + `baseUrl` + `api` + `models` to `models.providers`. No special-casing.

4. **Health check timeout is 90 seconds.** This is intentionally long for Windows. Don't reduce it without testing on slow machines.

5. **Tray app behavior.** Closing the window hides it; the app stays in the tray. `Cmd+Q` (or Quit from tray menu) actually quits. macOS Dock icon hides automatically when no windows are visible.

6. **macOS signing.** By default uses ad-hoc identity (`-`). Set `ONECLAW_MAC_SIGN_AND_NOTARIZE=true` + `CSC_NAME`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` in `.env` for real signing.

7. **Version is calendar-based** (`2026.2.13`). Don't manually edit `package.json` version.

8. **No local upstream directory needed.** openclaw is installed from npm directly during `package:resources`. The `upstream/` directory is no longer required.

9. **Blockmap generation is disabled.** Both DMG and NSIS have blockmap/differential disabled to avoid unnecessary `.blockmap` files.

10. **macOS auto-update requires ZIP.** electron-updater needs the ZIP artifact, not DMG. Both are built: DMG for manual distribution, ZIP for auto-update.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   Electron Main Process                   │
│                                                          │
│  main.ts ─── gateway-process.ts ─── constants.ts         │
│     │              │                     │               │
│     │         spawn child ──────── path resolution       │
│     │              │                                     │
│     ├── window.ts (BrowserWindow + token inject)         │
│     │     └── window-close-policy.ts (hide vs destroy)   │
│     ├── tray.ts   (system tray + i18n menu)              │
│     ├── provider-config.ts (presets + verify + config)   │
│     ├── setup-manager.ts + setup-ipc.ts (wizard)         │
│     ├── settings-ipc.ts + settings/ (embedded settings)  │
│     ├── analytics.ts (telemetry + retry + fallback)      │
│     ├── auto-updater.ts (CDN updates + progress)         │
│     ├── gateway-auth.ts (token management)               │
│     └── logger.ts (file + console)                       │
│                                                          │
│  preload.ts ─── contextBridge (15 IPC + 2 listeners)     │
└──────────────────┬───────────────────────────────────────┘
                   │
     ┌─────────────┴─────────────┐
     │   Gateway Child Process   │
     │   Node.js 22 + openclaw   │
     │   :18789 loopback only    │
     └─────────────┬─────────────┘
                   │ HTTP
     ┌─────────────┴─────────────┐
     │      BrowserWindow        │
     │   loads Control UI from   │
     │   http://127.0.0.1:18789  │
     └───────────────────────────┘
```
