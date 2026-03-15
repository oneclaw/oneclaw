# OneClaw — Electron Shell for openclaw

## What This Project Is

OneClaw is a cross-platform desktop app that wraps the [openclaw](https://github.com/anthropics/claude-code) gateway into a standalone installable package. It ships a bundled Node.js 22 runtime and the openclaw npm package, so users need zero dev tooling — just install and run.

**Three-process architecture:**

```
Electron Main Process
  ├── Gateway child process  (Node.js 22 → openclaw entry.js, port configurable, default 18789)
  ├── TTS worker child process (Node.js → tts-worker.js, on-demand, sherpa-onnx OfflineTts)
  ├── BrowserWindow          (loads Lit Chat UI via file://, connects to gateway via WebSocket)
  └── Live2D BrowserWindow   (transparent overlay, pixi-live2d-display, voice chat UI)
```

The main process spawns a gateway subprocess, waits for its health check, then opens a BrowserWindow that loads a local Lit-based Chat UI (via `file://`). A separate transparent Live2D window provides an interactive desktop pet with voice chat capabilities. A system tray icon keeps the app alive when all windows are closed.

## Tech Stack

| Layer | Choice |
|---|---|
| Shell | Electron 40.2.1 |
| Language | TypeScript → CommonJS (no ESM) |
| Chat UI | Lit 3 + Vite (file:// loaded SPA) |
| Packager | electron-builder 26.7.0 |
| Updater | electron-updater (generic provider, CDN at `oneclaw.cn`) |
| Targets | macOS DMG + ZIP (arm64/x64), Windows NSIS (x64/arm64) |
| Version scheme | Calendar-based: `2026.2.26` (auto-fetched from openclaw npm at build time) |
| Live2D | pixi-live2d-display (transparent BrowserWindow overlay) |
| ASR | sherpa-onnx-node (streaming paraformer bilingual zh-en) |
| TTS | sherpa-onnx-node OfflineTts (VITS, run in Node.js child process) |
| VAD | Silero VAD via sherpa-onnx (optional) |
| Microphone | naudiodon2 (PortAudio N-API binding) |

## Repository Layout

```
oneclaw/
├── src/                    # 25 TypeScript modules (6571 LOC) + 6 test files
│   ├── main.ts             # App entry, lifecycle, IPC, Dock toggle, config recovery
│   ├── constants.ts        # Path resolution (dev vs packaged), health check params
│   ├── gateway-process.ts  # Child process state machine + diagnostics
│   ├── gateway-auth.ts     # Auth token read/generate/persist
│   ├── gateway-rpc.ts      # WebSocket RPC client for main↔gateway communication
│   ├── window.ts           # BrowserWindow lifecycle, token injection, chat message injection
│   ├── window-close-policy.ts  # Close behavior: hide vs destroy
│   ├── tray.ts             # System tray icon + i18n context menu
│   ├── preload.ts          # contextBridge IPC whitelist (42 methods + 4 listeners)
│   ├── live2d-window.ts    # Live2D transparent BrowserWindow lifecycle + model management
│   ├── live2d-preload.ts   # Live2D window contextBridge (voice, chat, model IPC)
│   ├── speech-engine.ts    # sherpa-onnx ASR (streaming paraformer) + VAD + TTS subprocess
│   ├── tts-worker.js       # Standalone Node.js script for TTS (avoids Electron external buffer restriction)
│   ├── provider-config.ts  # Provider presets, verification, config R/W
│   ├── setup-manager.ts    # Setup wizard window lifecycle
│   ├── setup-ipc.ts        # Setup validation + config write + CLI install
│   ├── setup-completion.ts # Setup wizard completion detection
│   ├── oneclaw-config.ts   # OneClaw ownership config (deviceId, setupCompletedAt, migration)
│   ├── settings-ipc.ts     # Settings CRUD, backup/restore, Kimi, CLI, advanced
│   ├── config-backup.ts    # Rolling backups + last-known-good snapshot + restore
│   ├── share-copy.ts       # Remote share copy content (CDN fetch + local fallback)
│   ├── kimi-config.ts      # Kimi robot plugin + Kimi Search configuration
│   ├── cli-integration.ts  # CLI wrapper generation, PATH injection (POSIX + Windows)
│   ├── launch-at-login.ts  # macOS/Windows launch at login toggle
│   ├── feishu-pairing-monitor.ts  # Feishu pairing request polling + state
│   ├── update-banner-state.ts     # Update banner pure state machine
│   ├── analytics.ts        # Telemetry (PostHog-style, retry + fallback URL)
│   ├── analytics-events.ts # Event classification + property sanitization
│   ├── auto-updater.ts     # electron-updater wrapper + progress callback
│   └── logger.ts           # Dual-write logger (file + console)
├── chat-ui/                # Lit-based Chat UI SPA (file:// loaded)
│   └── ui/                 # Vite project: Lit 3 components, sidebar, settings view
├── live2d/                 # Live2D desktop pet frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # Live2D transparent window layout (model canvas + chat bubble + mic button)
│   ├── live2d.css          # Transparent window styling, chat bubble, mic button
│   ├── voice-chat.js       # Voice chat controller (ASR events, TTS playback, lip sync, keyboard shortcut)
│   └── chat-bubble.js      # Chat bubble UI component (user/AI text display)
├── resources/models/speech/ # Speech models (sherpa-onnx, gitignored)
│   ├── silero_vad.onnx                                    # Silero VAD model
│   ├── sherpa-onnx-streaming-paraformer-bilingual-zh-en/  # Streaming ASR model (encoder + decoder + tokens)
│   └── vits-zh-hf-theresa/                                # VITS TTS model (theresa.onnx + tokens + lexicon)
├── setup/                  # Setup wizard frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # 3-step wizard with data-i18n attributes
│   ├── setup.css           # Dark/light theme via prefers-color-scheme
│   └── setup.js            # i18n dict (en/zh) + form logic
├── settings/               # Settings page frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # Provider, Search, Channels, KimiClaw, Appearance, Advanced, Backup tabs
│   ├── settings.css        # Dark/light theme via prefers-color-scheme
│   └── settings.js         # Provider CRUD, Feishu, Kimi, Kimi Search, CLI, backup/restore
├── scripts/
│   ├── package-resources.js    # Downloads Node.js 22 + installs openclaw from npm
│   ├── afterPack.js            # electron-builder hook: injects resources post-strip
│   ├── run-mac-builder.js      # macOS build wrapper (sign + notarize)
│   ├── run-with-env.js         # .env loader for child processes
│   ├── merge-release-yml.js    # Merges per-arch latest.yml for auto-updater
│   ├── dist-all-parallel.sh    # Parallel cross-platform build
│   └── clean.sh
├── assets/                 # Icons: .icns, .ico, .png, tray templates
├── docs/                   # Plans and documentation
├── .github/workflows/      # CI: build-release.yml + publish-release.yml + publish-share-copy.yml
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

**Generation tracking:** Each `spawn()` call increments a generation counter. The exit handler only processes exits matching the current generation, preventing stale process exits from corrupting the state machine during rapid restart cycles.

Startup sequence:

1. Inject env vars: `OPENCLAW_LENIENT_CONFIG=1`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_NPM_BIN`, `OPENCLAW_NO_RESPAWN=1`
2. Prepend bundled runtime to `PATH`
3. Resolve entry: try `openclaw.mjs` first, fall back to `gateway-entry.mjs` (legacy)
4. Resolve port: env `OPENCLAW_GATEWAY_PORT` > config `gateway.port` > default `18789`
5. Spawn: `<node> <entry.js> gateway run --port <resolved> --bind loopback`
6. Disable gateway's own npm update check (`update.checkOnStart = false`) — OneClaw is packaged as a whole unit, users can't independently update the gateway
7. Poll `GET http://127.0.0.1:<port>/` every 500ms, 90s timeout
8. Verify child PID is still alive (avoid port collision false positives)

Main process retries gateway startup **3 times** before showing an error dialog. This covers Windows cold-start slowness (Defender scanning, disk warmup). On success, the current config is snapshotted as "last known good" for recovery.

All stdout/stderr is captured to `~/.openclaw/gateway.log` for diagnostics.

**Automatic restart:** Gateway automatically restarts after user config changes (provider switch, model change, etc.) to pick up the new settings.

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

Step 3 (Done) includes optional toggles for:

- **Install CLI**: Auto-install `openclaw` command to PATH (enabled by default)
- **Launch at Login**: Register app for system startup (macOS/Windows only)

Config is written to `~/.openclaw/openclaw.json`. Setup completion is marked by `config.wizard.lastRunAt`.

### Settings Page (`settings-ipc.ts`, `settings/`)

Post-setup configuration management embedded inside the Chat UI (via `app:navigate` IPC). Opened from tray menu "Settings", Chat UI sidebar button, or macOS `Cmd+,`.

Tabs:

- **Provider** — View/edit provider config, verify API key, switch models
- **Search** — Kimi Search web search toggle + dedicated API key (auto-reuses Kimi Code key if available)
- **Channels** — Feishu integration (appId + appSecret, DM scope, group access control, pairing approval/rejection)
- **KimiClaw** — Kimi robot plugin token + enable/disable toggle
- **Appearance** — Theme selector (system/light/dark), thinking process visibility
- **Advanced** — Browser profile selector (openclaw/Chrome), iMessage channel toggle, Launch at login toggle, CLI command (`openclaw`) install/uninstall
- **Backup & Restore** — Rolling backup list, restore last-known-good, gateway start/stop/restart, factory reset

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

### Kimi Plugin & Search (`kimi-config.ts`)

Kimi robot plugin and search configuration management:

- **kimi-claw**: Writes `plugins.entries["kimi-claw"]` with bridge/gateway WebSocket params; validates plugin bundling (`openclaw.plugin.json` + entry file) before enabling
- **kimi-search**: Dedicated API key stored in sidecar file (`~/.openclaw/credentials/kimi-search-api-key`); auto-reuses kimi-code provider API key if no dedicated key configured; auto-enabled when kimi-claw is enabled

### CLI Integration (`cli-integration.ts`)

Cross-platform `openclaw` command-line wrapper management:

- **POSIX**: Wrapper script at `~/.openclaw/bin/openclaw` + PATH injection into `.zprofile`/`.bash_profile` via `# >>> oneclaw-cli >>>` markers
- **Windows**: Wrapper `.cmd` at `%LOCALAPPDATA%\OneClaw\bin\` + PowerShell user PATH modification
- Idempotent install/uninstall with marker-based detection
- Auto-install during Setup completion (optional, enabled by default); manual toggle in Settings > Advanced

### Launch at Login (`launch-at-login.ts`)

System startup integration via `app.getLoginItemSettings()` / `setLoginItemSettings()`:

- Supported on macOS and Windows only (Linux unsupported)
- Pure functions for testability
- Configurable in Setup wizard step 3 and Settings > Advanced

### Feishu Pairing Monitor (`feishu-pairing-monitor.ts`)

Feishu robot pairing request polling and state management:

- Polling intervals: 10s foreground, 60s background
- Tracks pending pairing requests with auto-approval (oldest request first)
- Real-time state subscriptions via `onFeishuPairingState()` IPC listener

### Update Banner State Machine (`update-banner-state.ts`)

Pure state machine for update notification UI:

- Status flow: `hidden → available → downloading → (done | failed)`
- Download progress tracking (0–100%)
- Badge indicator for new update availability
- Real-time state subscriptions via `onUpdateState()` IPC listener

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

### Live2D Desktop Pet (`live2d-window.ts`, `live2d/`)

Transparent always-on-top window displaying an interactive Live2D model:

- **Transparent BrowserWindow**: `transparent: true`, frameless, always-on-top, click-through regions around the model
- **Model management**: Model list scanning, hot-swap via IPC (`live2d:change-model`), config persistence
- **Drag support**: Custom drag handling via `live2d:drag-window` IPC (transparent windows can't use native drag)
- **Mutual exclusion with main window**: When main Chat UI opens, Live2D hides; when Chat UI closes, Live2D reappears

### Speech Engine (`speech-engine.ts`, `tts-worker.js`)

Sherpa-onnx powered speech pipeline running in the Electron main process (ASR/VAD) and a Node.js child process (TTS):

**ASR (Automatic Speech Recognition):**
- Streaming paraformer bilingual (zh-en) via `OnlineRecognizer`
- Real-time microphone capture via naudiodon2 (PortAudio)
- Endpoint detection with configurable silence thresholds
- Interim results streamed to Live2D window via IPC (`live2d:interim-result`)
- Final results trigger the voice→chat→TTS pipeline

**VAD (Voice Activity Detection):**
- Optional Silero VAD model for speech/silence classification
- Non-fatal: ASR works without VAD

**TTS (Text-to-Speech):**
- VITS model (theresa, Chinese) via `OfflineTts`
- **Runs in a separate Node.js child process** (`tts-worker.js`) because Electron 40's V8 forbids N-API external ArrayBuffers — sherpa-onnx's `generate()` returns `Float32Array` backed by native external memory, which crashes in Electron's V8
- Child process writes PCM 16-bit mono WAV file to `$TMPDIR/oneclaw-tts/`
- Main process registers `oneclaw-tts://` custom protocol, renderer loads audio via `new Audio("oneclaw-tts://audio/<filename>.wav")`

**Voice→Chat→TTS pipeline:**
1. User holds `C` key → microphone starts recording
2. ASR produces final text → injected into Chat UI via `executeJavaScript` calling `handleSendChat()`
3. Main process polls Chat UI state (`chatRunId`/`chatSending`) until AI reply completes
4. Reply text cleaned of markdown/emoji → TTS child process generates WAV
5. WAV filename sent to Live2D renderer → `Audio` element plays via `oneclaw-tts://` protocol
6. `AnalyserNode` drives real-time lip sync (`setMouthOpenY`) during playback

### Voice Chat UI (`live2d/voice-chat.js`)

Voice interaction controller in the Live2D renderer process:

**Input methods:**
- **Keyboard shortcut**: Hold `C` key to talk, release to stop (push-to-talk). Ignores input fields, modifier combos, and `e.repeat`. Auto-stops on window blur
- **Mic button click**: Toggle listening on/off
- **Mic button long-press** (500ms): Push-to-talk mode via mouse hold

**Audio playback + lip sync:**
- TTS audio loaded via `oneclaw-tts://` custom protocol URL
- `MediaElementSource` → `AnalyserNode` for real-time frequency analysis
- Volume mapped to `mouthOpenY` (0–1) driving Live2D model mouth animation
- Fallback: text-length-based sine wave simulation when TTS unavailable

### Chat UI Injection (`window.ts`)

Voice-to-chat bridge via Chromium's `executeJavaScript`:

- `injectChatMessage(text)`: Calls `document.querySelector('openclaw-app').handleSendChat(text)` to inject ASR text as if typed
- `waitForChatReply()`: Polls every 300ms (60s timeout) watching `chatRunId`/`chatSending` transition from running→done, then extracts last assistant message from `chatMessages` array
- Returns full AI reply text to main process for TTS synthesis

### Custom Protocol for TTS Audio (`main.ts`)

Registered before `app.ready` via `protocol.registerSchemesAsPrivileged`:

- Scheme: `oneclaw-tts://` with `secure`, `supportFetchAPI`, `bypassCSP`, `stream` privileges
- Handler: `protocol.handle("oneclaw-tts", ...)` maps `oneclaw-tts://audio/<filename>` to `net.fetch("file://<tmpdir>/<filename>")`
- Security: Path traversal prevention — only serves files from `$TMPDIR/oneclaw-tts/`

### Incremental Resource Packaging (`package-resources.js`)

A stamp file (`resources/targets/<target>/.node-stamp`) records `version-platform-arch`. If stamp matches, skip download. Cross-platform builds (e.g., building win32-x64 on darwin-arm64) auto-detect the mismatch and re-download.

openclaw is installed directly from npm (no local upstream directory needed). Node.js download mirrors: npmmirror.com (China) first, nodejs.org fallback.

### afterPack Hook (`afterPack.js`)

electron-builder strips `node_modules` during packaging. The afterPack hook injects the pre-built gateway resources from `resources/targets/<target>/` into the final app bundle **after** stripping, bypassing the strip logic entirely.

Target ID resolution: env `ONECLAW_TARGET` > `${electronPlatformName}-${arch}`.

### Preload Security (`preload.ts`)

Electron 40 defaults to sandbox mode. 42 IPC methods + 4 event listeners are exposed via `contextBridge`:

**Gateway control:** `restartGateway`, `startGateway`, `stopGateway`, `getGatewayState`
**Auto-update:** `checkForUpdates`, `getUpdateState`, `downloadAndInstallUpdate`
**Feishu:** `getFeishuPairingState`, `refreshFeishuPairingState`
**Setup:** `verifyKey`, `saveConfig`, `setupGetLaunchAtLogin`, `completeSetup`
**Settings — Provider:** `settingsGetConfig`, `settingsVerifyKey`, `settingsSaveProvider`
**Settings — Channel:** `settingsGetChannelConfig`, `settingsSaveChannel`, `settingsListFeishuPairing`, `settingsListFeishuApproved`, `settingsApproveFeishuPairing`, `settingsRejectFeishuPairing`, `settingsAddFeishuGroupAllowFrom`, `settingsRemoveFeishuApproved`
**Settings — Kimi:** `settingsGetKimiConfig`, `settingsSaveKimiConfig`, `settingsGetKimiSearchConfig`, `settingsSaveKimiSearchConfig`
**Settings — Advanced/CLI:** `settingsGetAdvanced`, `settingsSaveAdvanced`, `settingsGetCliStatus`, `settingsInstallCli`, `settingsUninstallCli`
**Settings — Backup:** `settingsListConfigBackups`, `settingsRestoreConfigBackup`, `settingsRestoreLastKnownGood`, `settingsResetConfigAndRelaunch`
**Settings — Share:** `settingsGetShareCopy`
**Event listeners:** `onSettingsNavigate`, `onNavigate`, `onUpdateState`, `onFeishuPairingState`
**Chat UI:** `openSettings`, `openWebUI`, `getGatewayPort`
**Utility:** `openExternal`

**Live2D window IPC** (`live2d-preload.ts`):
**Window:** `openMainWindow`, `dragWindow`
**Model:** `getConfig`, `getModelList`, `changeModel`, `getModelsDir`, `onChangeModel`
**Chat:** `sendChat`
**Voice:** `startListening`, `stopListening`, `checkSpeechModels`
**Voice events:** `onInterimResult`, `onFinalResult`, `onAIReply`, `onListeningStateChange`

`openExternal` exists because `shell.openExternal` is unavailable in sandboxed preload — must go through IPC to main process.

## Runtime Paths (on user's machine)

```
~/.openclaw/
  ├── openclaw.json                    # User config (provider, model, auth token, channels)
  ├── oneclaw.config.json              # OneClaw ownership marker (deviceId, setupCompletedAt)
  ├── openclaw.last-known-good.json    # Last successful gateway startup config snapshot
  ├── .device-id                       # Analytics device ID (UUID)
  ├── app.log                          # Application log (5MB truncate)
  ├── gateway.log                      # Gateway child process diagnostic log
  ├── config-backups/                  # Rolling config backups (max 10)
  │   └── openclaw-YYYYMMDD-HHmmss.json
  ├── credentials/
  │   └── kimi-search-api-key          # Kimi Search dedicated API key (sidecar file)
  └── bin/
      └── openclaw                     # CLI wrapper script (POSIX) or .cmd (Windows)
```

## Design Rules

For comprehensive design guidelines, please refer to:

- [Design Guidelines (English)](docs/design-guidelines-en.md)
- [Design Guidelines (Chinese)](docs/design-guidelines-zh.md)

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

7. **Version is calendar-based** (`2026.2.26`). Don't manually edit `package.json` version.

8. **No local upstream directory needed.** openclaw is installed from npm directly during `package:resources`. The `upstream/` directory is no longer required.

9. **Blockmap generation is disabled.** Both DMG and NSIS have blockmap/differential disabled to avoid unnecessary `.blockmap` files.

10. **macOS auto-update requires ZIP.** electron-updater needs the ZIP artifact, not DMG. Both are built: DMG for manual distribution, ZIP for auto-update.

11. **`OPENCLAW_NO_RESPAWN=1` is required.** All child processes (gateway, doctor, CLI) must set this env var to prevent subprocess self-respawning, which causes console window flickering on Windows.

12. **Gateway entry fallback.** `resolveGatewayEntry()` tries `openclaw.mjs` first (new packages), then falls back to `gateway-entry.mjs` (legacy). Both paths must be considered during packaging verification.

13. **CLI wrapper uses RC block markers.** Install/uninstall is idempotent via `# >>> oneclaw-cli >>>` / `# <<< oneclaw-cli <<<` markers in shell profiles. Always check for marker presence before modifying.

14. **Kimi Search API key is a sidecar file**, not in `openclaw.json`. Stored at `~/.openclaw/credentials/kimi-search-api-key`. Auto-reuses kimi-code provider key if no dedicated key exists.

15. **AGENTS.md is a symlink to CLAUDE.md.** Don't create separate content — they share the same file.

16. **Gateway port is configurable.** Resolution order: env `OPENCLAW_GATEWAY_PORT` > config `gateway.port` in `openclaw.json` > default `18789`. Don't hardcode port numbers — use `resolveGatewayPort()` from `constants.ts`.

17. **Gateway npm update check is disabled.** OneClaw writes `update.checkOnStart = false` to the gateway config at startup. The gateway cannot self-update inside a packaged Electron app.

18. **`oneclaw.config.json` is the ownership marker.** OneClaw uses this file to detect config ownership at startup. Detection flow: `oneclaw.config.json` exists → normal startup; `.device-id` exists → legacy migration; `openclaw.json` exists without marker → external OpenClaw takeover; nothing → fresh Setup. Do not delete this file manually.

19. **TTS must run in a child process, not in Electron.** Electron 40's V8 forbids N-API external ArrayBuffers. sherpa-onnx's `OfflineTts.generate()` returns `Float32Array` backed by native external memory, which causes `External buffers are not allowed` errors in Electron. The TTS worker (`tts-worker.js`) runs in a separate system `node` process to avoid this restriction.

20. **TTS audio served via custom protocol.** Renderers can't access `file://` paths from temp directories due to security restrictions. The `oneclaw-tts://` custom protocol registered via `protocol.handle()` serves WAV files from `$TMPDIR/oneclaw-tts/` to the Live2D renderer.

21. **`tts-worker.js` must be copied to `dist/` during build.** It's a plain `.js` file (not TypeScript), so `tsc` won't process it. The build script includes `cp src/tts-worker.js dist/tts-worker.js`.

22. **Speech models are not bundled in the repo.** Models in `resources/models/speech/` are gitignored and must be downloaded separately. ASR requires `encoder.int8.onnx`, `decoder.int8.onnx`, `tokens.txt`; TTS requires `theresa.onnx`, `tokens.txt`, `lexicon.txt`.

23. **`DYLD_LIBRARY_PATH` must be set before Electron starts (dev mode).** sherpa-onnx native addon depends on co-located `.dylib` files. macOS's DYLD_LIBRARY_PATH cannot be set after process start. The `dev` script sets it: `DYLD_LIBRARY_PATH=$PWD/node_modules/sherpa-onnx-darwin-x64:$DYLD_LIBRARY_PATH electron .`

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                   Electron Main Process                       │
│                                                              │
│  main.ts ─── gateway-process.ts ─── constants.ts             │
│     │              │                     │                   │
│     │         spawn child ──────── path resolution           │
│     │              │                                         │
│     ├── window.ts (BrowserWindow + token inject + chat inject)│
│     │     └── window-close-policy.ts (hide vs destroy)       │
│     ├── live2d-window.ts (transparent Live2D BrowserWindow)  │
│     │     └── live2d-preload.ts (voice/chat/model IPC)       │
│     ├── speech-engine.ts (ASR + VAD + TTS subprocess mgmt)  │
│     │     └── tts-worker.js (child process: sherpa-onnx TTS) │
│     ├── tray.ts   (system tray + i18n menu)                  │
│     ├── provider-config.ts (presets + verify + config)       │
│     ├── config-backup.ts (rolling backups + recovery)        │
│     ├── setup-manager.ts + setup-ipc.ts (wizard + CLI)       │
│     │     └── setup-completion.ts (completion detection)     │
│     ├── settings-ipc.ts + settings/ (embedded settings)      │
│     ├── share-copy.ts (CDN content + fallback)               │
│     ├── kimi-config.ts (Kimi plugin + Kimi Search)           │
│     ├── cli-integration.ts (CLI wrapper + PATH injection)    │
│     ├── launch-at-login.ts (system startup toggle)           │
│     ├── feishu-pairing-monitor.ts (pairing request polling)  │
│     ├── update-banner-state.ts (update UI state machine)     │
│     ├── gateway-rpc.ts (WebSocket RPC to gateway)            │
│     ├── analytics.ts + analytics-events.ts (telemetry)       │
│     ├── auto-updater.ts (CDN updates + progress)             │
│     ├── gateway-auth.ts (token management)                   │
│     └── logger.ts (file + console)                           │
│                                                              │
│  preload.ts ─── contextBridge (42 IPC + 4 listeners)         │
│  protocol: oneclaw-tts:// (serves TTS WAV from temp dir)     │
└──────────────────┬───────────────┬───────────────────────────┘
                   │               │
     ┌─────────────┴──────┐  ┌────┴──────────────────────┐
     │  Gateway Child Proc │  │  Live2D BrowserWindow     │
     │  Node.js 22+openclaw│  │  transparent overlay      │
     │  :configurable port │  │  pixi-live2d-display      │
     └─────────────┬───────┘  │  voice-chat.js (C key PTT)│
                   │          │  chat-bubble.js           │
                   │ WS+HTTP  └────┬──────────────────────┘
     ┌─────────────┴──────┐       │ IPC (ASR/TTS/chat)
     │    BrowserWindow   │       │
     │  Lit Chat UI from  │◄──────┘ injectChatMessage()
     │  file:// (chat-ui/)│
     └────────────────────┘

Voice Pipeline:
  [Mic] → naudiodon2 → SpeechEngine(ASR) → final text
    → injectChatMessage(text) → Chat UI → AI reply
    → cleanTextForTts() → tts-worker.js(child proc) → WAV file
    → oneclaw-tts:// protocol → Audio element → AnalyserNode → lip sync
```
