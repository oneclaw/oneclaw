# OneClaw — Electron Shell for openclaw

## What This Project Is

OneClaw is a cross-platform desktop app that wraps the [openclaw](https://github.com/anthropics/claude-code) gateway into a standalone installable package. It ships a bundled Node.js 22 runtime and the openclaw npm package, so users need zero dev tooling — just install and run.

**Three-process architecture:**

```
Electron Main Process
  ├── Gateway child process  (Node.js 22 → openclaw entry.js, port 18789)
  └── BrowserWindow          (loads Lit Chat UI via file://, connects to gateway via WebSocket)
```

The main process spawns a gateway subprocess, waits for its health check, then opens a BrowserWindow that loads a local Lit-based Chat UI (via `file://`). The Chat UI connects to the gateway over WebSocket for chat and HTTP for API calls. A system tray icon keeps the app alive when all windows are closed.

## Tech Stack

| Layer | Choice |
|---|---|
| Shell | Electron 40.2.1 |
| Language | TypeScript → CommonJS (no ESM) |
| Chat UI | Lit 3 + Vite (file:// loaded SPA) |
| Packager | electron-builder 26.7.0 |
| Updater | electron-updater (generic provider, CDN at `oneclaw.cn`) |
| Targets | macOS DMG + ZIP (arm64/x64), Windows NSIS (x64/arm64) |
| Version scheme | Calendar-based: `2026.2.23` (auto-fetched from openclaw npm at build time) |

## Repository Layout

```
oneclaw/
├── src/                    # 20 TypeScript modules (4291 LOC total)
│   ├── main.ts             # App entry, lifecycle, IPC, Dock toggle, config recovery
│   ├── constants.ts        # Path resolution (dev vs packaged), health check params
│   ├── gateway-process.ts  # Child process state machine + diagnostics
│   ├── gateway-auth.ts     # Auth token read/generate/persist
│   ├── gateway-rpc.ts      # WebSocket RPC client for main↔gateway communication
│   ├── window.ts           # BrowserWindow lifecycle, token injection, retry
│   ├── window-close-policy.ts  # Close behavior: hide vs destroy
│   ├── tray.ts             # System tray icon + i18n context menu
│   ├── preload.ts          # contextBridge IPC whitelist (33 methods + 4 listeners)
│   ├── provider-config.ts  # Provider presets, verification, config R/W
│   ├── setup-manager.ts    # Setup wizard window lifecycle
│   ├── setup-ipc.ts        # Setup validation + config write
│   ├── settings-ipc.ts     # Settings CRUD, backup/restore, Doctor, Kimi, advanced
│   ├── config-backup.ts    # Rolling backups + last-known-good snapshot + restore
│   ├── share-copy.ts       # Remote share copy content (CDN fetch + local fallback)
│   ├── kimi-config.ts      # Kimi robot plugin configuration
│   ├── analytics.ts        # Telemetry (PostHog-style, retry + fallback URL)
│   ├── auto-updater.ts     # electron-updater wrapper + progress callback
│   └── logger.ts           # Dual-write logger (file + console)
├── chat-ui/                # Lit-based Chat UI SPA (file:// loaded)
│   └── ui/                 # Vite project: Lit 3 components, sidebar, settings view
├── setup/                  # Setup wizard frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # 3-step wizard with data-i18n attributes
│   ├── setup.css           # Dark/light theme via prefers-color-scheme
│   └── setup.js            # i18n dict (en/zh) + form logic
├── settings/               # Settings page frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # Model, Channel, KimiClaw, Appearance, Advanced, Backup tabs
│   ├── settings.css        # Dark/light theme via prefers-color-scheme
│   └── settings.js         # Provider CRUD, Feishu, Kimi, backup/restore, Doctor
├── scripts/
│   ├── package-resources.js    # Downloads Node.js 22 + installs openclaw from npm
│   ├── afterPack.js            # electron-builder hook: injects resources post-strip
│   ├── run-mac-builder.js      # macOS build wrapper (sign + notarize)
│   ├── run-with-env.js         # .env loader for child processes
│   ├── merge-release-yml.js    # Merges per-arch latest.yml for auto-updater
│   ├── dist-all-parallel.sh    # Parallel cross-platform build
│   └── clean.sh
├── assets/                 # Icons: .icns, .ico, .png, tray templates
├── .github/workflows/      # CI: build-release.yml + publish-share-copy.yml
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
chat-ui/dist/                        # Vite output (Lit Chat UI SPA)
dist/                                # tsc output
out/                                 # electron-builder output (DMG/NSIS)
.cache/node/                         # Downloaded Node.js tarballs
```

## Build Commands

```bash
npm run build                # Vite (chat-ui) + TypeScript → dist/
npm run build:chat           # Build Chat UI only (Lit + Vite)
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
2. `build:chat` — Vite builds Lit Chat UI into `chat-ui/dist/`
3. `tsc` — compile TypeScript
4. `electron-builder` → `afterPack.js` injects `resources/targets/<target>/` into app bundle → DMG/ZIP/NSIS

## Key Design Decisions

### Gateway Child Process (`gateway-process.ts`)

State machine: `stopped → starting → running → stopping → stopped`

Startup sequence:
1. Inject env vars: `OPENCLAW_LENIENT_CONFIG=1`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_NPM_BIN`, `OPENCLAW_NO_RESPAWN=1`
2. Prepend bundled runtime to `PATH`
3. Resolve entry: try `openclaw.mjs` first, fall back to `gateway-entry.mjs` (legacy)
4. Spawn: `<node> <entry.js> gateway run --port 18789 --bind loopback`
5. Poll `GET http://127.0.0.1:18789/` every 500ms, 90s timeout
6. Verify child PID is still alive (avoid port collision false positives)

Main process retries gateway startup **3 times** before showing an error dialog. This covers Windows cold-start slowness (Defender scanning, disk warmup). On success, the current config is snapshotted as "last known good" for recovery.

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

Post-setup configuration management embedded inside the Chat UI (via `app:navigate` IPC). Opened from tray menu "Settings", Chat UI sidebar button, or macOS `Cmd+,`.

Tabs:
- **Model** — View/edit provider config, verify API key, switch models
- **Chat Channel** — Feishu integration (appId + appSecret, DM scope, group access control, pairing approval)
- **KimiClaw** — Kimi robot plugin token + enable/disable toggle
- **Appearance** — Theme selector (system/light/dark), thinking process visibility
- **Advanced** — Browser profile selector (openclaw/Chrome), iMessage channel toggle
- **Backup & Restore** — Rolling backup list, restore last-known-good, gateway start/stop/restart, factory reset
- **Doctor** — Run `openclaw doctor --non-interactive --repair` with streamed output

### Config Backup & Recovery (`config-backup.ts`)

Non-destructive config safety net:
- **Rolling backups**: Max 10 timestamped copies in `~/.openclaw/config-backups/`, created automatically before every config write
- **Last Known Good**: Snapshot of config at most recent successful gateway startup (`openclaw.last-known-good.json`)
- **Setup baseline**: Read-only copy of initial post-wizard config
- **Recovery flow**: On startup, if config is invalid JSON or gateway fails to start, the main process offers "Restore Last Known Good" / "Open Settings" / "Dismiss"
- **Factory reset**: Delete config entirely and relaunch into Setup wizard (preserves chat history)

### Share Copy (`share-copy.ts`)

Remote marketing content distribution for the "Share OneClaw" feature in Settings:
- Fetches from CDN (`oneclaw.cn/config/share-copy-content.json`) with 5-minute cache
- Falls back to bundled `settings/share-copy-content.json`, then hardcoded defaults
- Bilingual (zh/en) with automatic field normalization

### Kimi Plugin (`kimi-config.ts`)

Kimi robot plugin configuration management:
- Writes `plugins.entries["kimi-claw"]` with bridge/gateway WebSocket params
- Validates plugin bundling (`openclaw.plugin.json` + entry file) before enabling
- Enables `kimi-search` alongside `kimi-claw`

### Gateway RPC (`gateway-rpc.ts`)

Low-level WebSocket RPC for main→gateway communication:
- One-shot calls: connect → Protocol 3 handshake → method → close
- Used internally for gateway CLI invocations (e.g., `gateway stop` to probe stale ports)

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

Electron 40 defaults to sandbox mode. 33 IPC methods + 4 event listeners are exposed via `contextBridge`:

**Gateway control:** `restartGateway`, `startGateway`, `stopGateway`, `getGatewayState`
**Auto-update:** `checkForUpdates`
**Setup:** `verifyKey`, `saveConfig`, `completeSetup`
**Settings — Provider:** `settingsGetConfig`, `settingsVerifyKey`, `settingsSaveProvider`
**Settings — Channel:** `settingsGetChannelConfig`, `settingsSaveChannel`, `settingsListFeishuPairing`, `settingsListFeishuApproved`, `settingsApproveFeishuPairing`, `settingsAddFeishuGroupAllowFrom`, `settingsRemoveFeishuApproved`
**Settings — Kimi:** `settingsGetKimiConfig`, `settingsSaveKimiConfig`
**Settings — Advanced:** `settingsGetAdvanced`, `settingsSaveAdvanced`
**Settings — Backup:** `settingsListConfigBackups`, `settingsRestoreConfigBackup`, `settingsRestoreLastKnownGood`, `settingsResetConfigAndRelaunch`
**Settings — Share:** `settingsGetShareCopy`
**Settings — Doctor:** `settingsRunDoctor`
**Event listeners:** `onDoctorOutput`, `onDoctorExit`, `onSettingsNavigate`, `onNavigate`
**Chat UI:** `openSettings`, `openWebUI`, `getGatewayPort`
**Utility:** `openExternal`

`openExternal` exists because `shell.openExternal` is unavailable in sandboxed preload — must go through IPC to main process.

## Runtime Paths (on user's machine)

```
~/.openclaw/
  ├── openclaw.json                    # User config (provider, model, auth token, channels)
  ├── openclaw.last-known-good.json    # Last successful gateway startup config snapshot
  ├── .device-id                       # Analytics device ID (UUID)
  ├── app.log                          # Application log (5MB truncate)
  ├── gateway.log                      # Gateway child process diagnostic log
  └── config-backups/                  # Rolling config backups (max 10)
      └── openclaw-YYYYMMDD-HHmmss.json
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

7. **Version is calendar-based** (`2026.2.23`). Don't manually edit `package.json` version.

8. **No local upstream directory needed.** openclaw is installed from npm directly during `package:resources`. The `upstream/` directory is no longer required.

9. **Blockmap generation is disabled.** Both DMG and NSIS have blockmap/differential disabled to avoid unnecessary `.blockmap` files.

10. **macOS auto-update requires ZIP.** electron-updater needs the ZIP artifact, not DMG. Both are built: DMG for manual distribution, ZIP for auto-update.

11. **`OPENCLAW_NO_RESPAWN=1` is required.** All child processes (gateway, doctor, CLI) must set this env var to prevent subprocess self-respawning, which causes console window flickering on Windows.

12. **Gateway entry fallback.** `resolveGatewayEntry()` tries `openclaw.mjs` first (new packages), then falls back to `gateway-entry.mjs` (legacy). Both paths must be considered during packaging verification.

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
│     ├── config-backup.ts (rolling backups + recovery)    │
│     ├── setup-manager.ts + setup-ipc.ts (wizard)         │
│     ├── settings-ipc.ts + settings/ (embedded settings)  │
│     ├── share-copy.ts (CDN content + fallback)           │
│     ├── kimi-config.ts (Kimi plugin management)          │
│     ├── gateway-rpc.ts (WebSocket RPC to gateway)        │
│     ├── analytics.ts (telemetry + retry + fallback)      │
│     ├── auto-updater.ts (CDN updates + progress)         │
│     ├── gateway-auth.ts (token management)               │
│     └── logger.ts (file + console)                       │
│                                                          │
│  preload.ts ─── contextBridge (33 IPC + 4 listeners)     │
└──────────────────┬───────────────────────────────────────┘
                   │
     ┌─────────────┴─────────────┐
     │   Gateway Child Process   │
     │   Node.js 22 + openclaw   │
     │   :18789 loopback only    │
     └─────────────┬─────────────┘
                   │ HTTP + WebSocket
     ┌─────────────┴─────────────┐
     │      BrowserWindow        │
     │  loads Lit Chat UI from   │
     │  file:// (chat-ui/dist/)  │
     └───────────────────────────┘
```
