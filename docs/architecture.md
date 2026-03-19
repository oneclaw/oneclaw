# OneClaw Architecture — Key Design Decisions

> 从 CLAUDE.md 拆分出的详细设计文档。每个子系统的设计决策、状态机、启动序列均记录在此。

## Gateway Child Process (`gateway-process.ts`)

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

## Token Injection (`window.ts`)

The gateway requires an auth token. The main process generates one (or reads from config), passes it to the gateway via env var, and injects it into the BrowserWindow via URL fragment (`#token=...`) before `loadFile()`.

## Provider Configuration (`provider-config.ts`)

Centralized module for all provider presets, API key verification, and config file I/O. Shared by both Setup wizard and Settings page.

Supported providers:

- **Anthropic** — standard Anthropic Messages API
- **Kimi** — 3 sub-platforms: `moonshot-cn`, `moonshot-ai`, `kimi-code`
- **OpenAI** — OpenAI completions API
- **Google** — Google Generative AI
- **Custom** — user-supplied base URL + API type

All sub-platforms (including Kimi Code) use a unified config format: `apiKey` + `baseUrl` + `api` + `models` written to `models.providers`.

## Kimi OAuth (`kimi-oauth.ts`)

Device code flow for Kimi Code login:

- Opens browser to `auth.kimi.com` with device code
- Polls for token completion (max 120 retries)
- Token refresh: 60s interval, triggers when remaining < 300s (aligned with kimi-cli)
- Tokens persisted to `~/.openclaw/credentials/`

## Setup Wizard (`setup-ipc.ts`, `setup/`)

First-launch wizard flow:

- **Step 0**: Installation conflict detection (`install-detector.ts`) — checks for global `openclaw`/`openclaw-cn` installs + port occupation, offers uninstall or port change
- **Step 1**: Welcome
- **Step 2**: Provider Config (API key + provider selection, or Kimi OAuth login)
- **Step 3**: Done — optional toggles for Install CLI + Launch at Login

Config is written to `~/.openclaw/openclaw.json`. Setup completion is marked by `config.wizard.lastRunAt`.

## Settings Page (`settings-ipc.ts`, `settings/`)

Post-setup configuration management embedded inside the Chat UI (via `app:navigate` IPC). Opened from tray menu "Settings", Chat UI sidebar button, or macOS `Cmd+,`.

Tabs:

- **Provider** — View/edit provider config, verify API key, switch models, Kimi usage display
- **Search** — Kimi Search web search toggle + dedicated API key (auto-reuses Kimi Code key if available)
- **Channels** — Multi-channel chat integration (Feishu, WeCom, DingTalk, QQ Bot) with platform status indicators
- **KimiClaw** — Kimi robot plugin token + enable/disable toggle
- **Appearance** — Theme selector (system/light/dark), thinking process visibility
- **Advanced** — Browser profile selector (openclaw/Chrome), iMessage channel toggle, Launch at login toggle, CLI command (`openclaw`) install/uninstall
- **Backup & Restore** — Rolling backup list, restore last-known-good, gateway start/stop/restart, factory reset

## Multi-Channel Chat Integration

### Channel Pairing Monitor (`channel-pairing-monitor.ts`)

Unified multi-channel pairing request polling and state management:

- Aggregates pairing requests from Feishu, WeCom, and other channels
- Polling intervals: 10s foreground, 60s background
- Per-channel state tracking with auto-approval (oldest request first)
- Real-time state subscriptions via `onPairingState()` IPC listener

### Channel Pairing Store (`channel-pairing-store.ts`)

Persistent storage for channel-specific pairing approvals and allowlists:

- Per-channel `allowFrom` entries with normalization and dedup
- Backward-compatible with legacy single-channel files

### Feishu (`feishu-pairing-monitor.ts`)

Legacy Feishu-specific pairing monitor, still active alongside the unified monitor.

### WeCom (`wecom-config.ts`)

WeCom (企业微信) plugin configuration:

- DM policy: `pairing` or `open`
- Group policy: `open`, `allowlist`, or `disabled`
- Crypto callback verification for webhook events

### DingTalk (`dingtalk-config.ts`)

DingTalk connector plugin configuration:

- Client ID + secret based auth
- Configurable session timeout (default 30min)

### QQ Bot (`qqbot-config.ts`)

QQ Bot plugin configuration:

- App ID + client secret
- Optional Markdown support toggle

## Config Backup & Recovery (`config-backup.ts`)

Non-destructive config safety net:

- **Rolling backups**: Max 10 timestamped copies in `~/.openclaw/config-backups/`, created automatically before every config write
- **Last Known Good**: Snapshot of config at most recent successful gateway startup (`openclaw.last-known-good.json`)
- **Setup baseline**: Read-only copy of initial post-wizard config
- **Recovery flow**: On startup, if config is invalid JSON or gateway fails to start, the main process offers "Restore Last Known Good" / "Open Settings" / "Dismiss"
- **Factory reset**: Delete config entirely and relaunch into Setup wizard (preserves chat history)

## Share Copy (`share-copy.ts`)

Remote marketing content distribution for the "Share OneClaw" feature in Settings:

- Fetches from CDN (`oneclaw.cn/config/share-copy-content.json`) with 5-minute cache
- Falls back to bundled `settings/share-copy-content.json`, then hardcoded defaults
- Bilingual (zh/en) with automatic field normalization

## Kimi Plugin & Search (`kimi-config.ts`)

Kimi robot plugin and search configuration management:

- **kimi-claw**: Writes `plugins.entries["kimi-claw"]` with bridge/gateway WebSocket params; validates plugin bundling (`openclaw.plugin.json` + entry file) before enabling
- **kimi-search**: Dedicated API key stored in sidecar file (`~/.openclaw/credentials/kimi-search-api-key`); auto-reuses kimi-code provider API key if no dedicated key configured; auto-enabled when kimi-claw is enabled

## Skill Store (`skill-store.ts`)

Skill marketplace integration via clawhub CLI:

- Registry URL from `build-config.json` or `oneclaw.config.json`, fallback to `https://clawhub.ai`
- Install/uninstall via `clawhub install/uninstall` subprocess (not self-implemented ZIP extraction)
- Skill directory: `~/.openclaw/workspace/skills/`
- Store config in standalone `~/.openclaw/skill-store.json` (not in gateway config)
- API field mapping: `items→skills`, `displayName→name`, `summary→description`, `tags.latest→version`, `stats.downloads→downloads`

## Build Config (`build-config.ts`)

Build-time injected configuration reader (renamed from `analytics-config`):

- Reads `build-config.json` from packaged resources (multiple candidate paths)
- Cached after first read
- Provides PostHog API key, clawhub registry URL, and other build-time constants

## Install Detector (`install-detector.ts`)

Setup Step 0 conflict detection:

- Port occupation check (default 18789)
- Global `openclaw`/`openclaw-cn` npm install detection
- OneClaw's own CLI wrapper excluded via marker string detection
- Provides `resolveConflict()` for uninstall or port reassignment

## Gateway ASAR Packaging (`package-resources.js` + `constants.ts`)

Optional single-file archive for the gateway directory, dramatically reducing Windows install time (5000+ files → 1 file).

**Build-time** (`ONECLAW_GATEWAY_ASAR=1`):

1. `package-resources.js` patches openclaw's `openBoundaryFileSync()` to skip `.asar` path validation
2. Creates `gateway.asar` via `@electron/asar`, unpacking `*.node` files and `extensions/` directory
3. Result: `gateway.asar` (~230MB) + `gateway.asar.unpacked/` (native modules + extensions)

**Runtime path resolution** (`constants.ts`):

- `resolveGatewayRoot()` — auto-detects `gateway.asar` vs `gateway/` directory
- `resolveGatewayCwd()` — ASAR mode returns `~/.openclaw/` (OS can't chdir into ASAR); non-ASAR returns package dir
- `resolveGatewayPackageDir()` — always points inside gateway root (ASAR patch transparent for main process reads)
- `resolveCliRuntime()` — ASAR mode uses Electron binary + `ELECTRON_RUN_AS_NODE`; non-ASAR uses real Node.js

**CLI wrapper ASAR support** (`cli-integration.ts`):

- `WrapperOptions.asarEntry` flag skips shell-level file existence check (shell can't see inside `.asar`)
- `WrapperOptions.env` injects `ELECTRON_RUN_AS_NODE=1` and `OPENCLAW_INSTALL_ROOT` for ASAR mode

## Multi-Model Management (`settings-ipc.ts`)

IPC handlers for managing models across providers:

- `settings:get-configured-models` — list all configured models with provider info, alias, and default status
- `settings:delete-model` — remove a specific model from provider config
- `settings:set-default-model` — set a model as the default for the gateway
- `settings:update-model-alias` — update a model's display alias

Settings UI shows a model list panel in the Provider tab with per-model actions.
Chat UI includes a per-session model selector for switching models without changing settings.

## CLI Integration (`cli-integration.ts`)

Cross-platform `openclaw` command-line wrapper management:

- **POSIX**: Wrapper script at `~/.openclaw/bin/openclaw` + PATH injection into `.zprofile`/`.bash_profile` via `# >>> oneclaw-cli >>>` markers
- **Windows**: Wrapper `.cmd` at `%LOCALAPPDATA%\OneClaw\bin\` + PowerShell user PATH modification; legacy `~/.openclaw/bin/` path auto-migrated
- **ASAR mode**: Wrapper uses Electron binary + `ELECTRON_RUN_AS_NODE=1` + `OPENCLAW_INSTALL_ROOT` env var; skips shell-level entry file check (`.asar` paths invisible to OS)
- **Non-ASAR mode**: Wrapper uses real bundled Node.js binary (SUBSYSTEM:CONSOLE for TTY support)
- Idempotent install/uninstall with marker-based detection
- Auto-install during Setup completion (optional, enabled by default); manual toggle in Settings > Advanced
- CLI preference persisted in `oneclaw.config.json` (migrated from legacy `cli-preferences.json` sidecar)

## Launch at Login (`launch-at-login.ts`)

System startup integration via `app.getLoginItemSettings()` / `setLoginItemSettings()`:

- Supported on macOS and Windows only (Linux unsupported)
- Pure functions for testability
- Configurable in Setup wizard step 3 and Settings > Advanced

## Update Banner State Machine (`update-banner-state.ts`)

Pure state machine for update notification UI:

- Status flow: `hidden → available → downloading → (done | failed)`
- Download progress tracking (0–100%)
- Badge indicator for new update availability
- Real-time state subscriptions via `onUpdateState()` IPC listener

## Gateway RPC (`gateway-rpc.ts`)

Low-level WebSocket RPC for main→gateway communication:

- One-shot calls: connect → Protocol 3 handshake → method → close
- Used internally for gateway CLI invocations (e.g., `gateway stop` to probe stale ports)

## macOS Dock Visibility (`main.ts`)

Dynamic Dock icon toggle: visible when any window is shown, hidden when all windows are closed (pure tray mode). Driven by `browser-window-created` + `show`/`hide`/`closed` events.

## Tray i18n (`tray.ts`)

Tray context menu labels are localized (Chinese/English) based on `app.getLocale()`. Menu includes: Open Dashboard, Gateway status, Restart Gateway, Settings, Check for Updates, Quit.

## Auto-Updater (`auto-updater.ts`)

CDN-based updates via `electron-updater`:

- macOS requires ZIP artifact (DMG is for manual distribution)
- Auto-check every 4 hours (30s startup delay)
- Download progress shown in tray tooltip
- Pre-quit callback ensures window close policy doesn't block `quitAndInstall()`

## Incremental Resource Packaging (`package-resources.js`)

A stamp file (`resources/targets/<target>/.node-stamp`) records `version-platform-arch`. If stamp matches, skip download. Cross-platform builds (e.g., building win32-x64 on darwin-arm64) auto-detect the mismatch and re-download.

openclaw is installed directly from npm (no local upstream directory needed). Node.js download mirrors: npmmirror.com (China) first, nodejs.org fallback.

## afterPack Hook (`afterPack.js`)

electron-builder strips `node_modules` during packaging. The afterPack hook injects the pre-built gateway resources from `resources/targets/<target>/` into the final app bundle **after** stripping, bypassing the strip logic entirely.

Target ID resolution: env `ONECLAW_TARGET` > `${electronPlatformName}-${arch}`.

ASAR mode: copies `gateway.asar` + `gateway.asar.unpacked/` instead of `gateway/` directory.
Non-ASAR mode: copies `gateway/` directory as before.

Windows Helper: creates a hard link `OneClaw Helper.exe` → `OneClaw.exe` for use as `ELECTRON_RUN_AS_NODE` process (avoids taskbar icon flash).

## Windows Installer (`installer.nsh`)

Custom NSIS assisted installer with:

- **Desktop shortcut on update**: Detects `ONECLAW_IS_UPDATE` env to force desktop shortcut creation during silent updates
- **Custom uninstall page**: Offers CLI cleanup (wrapper + PATH removal) and user data removal (`~/.openclaw/`) as opt-in checkboxes
- **CLI cleanup**: Runs PowerShell to remove `%LOCALAPPDATA%\OneClaw\bin` from user PATH and delete wrapper files

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                   Electron Main Process                       │
│                                                              │
│  main.ts ─── gateway-process.ts ─── constants.ts             │
│     │              │                     │                   │
│     │         spawn child ──────── path resolution           │
│     │              │                                         │
│     ├── window.ts (BrowserWindow + token inject)             │
│     │     └── window-close-policy.ts (hide vs destroy)       │
│     ├── tray.ts   (system tray + i18n menu)                  │
│     ├── provider-config.ts (presets + verify + config)       │
│     ├── config-backup.ts (rolling backups + recovery)        │
│     ├── setup-manager.ts + setup-ipc.ts (wizard + CLI)       │
│     │     ├── setup-completion.ts (completion detection)     │
│     │     └── install-detector.ts (conflict detection)       │
│     ├── settings-ipc.ts + settings/ (embedded settings)      │
│     ├── kimi-oauth.ts (device code login + token refresh)    │
│     ├── share-copy.ts (CDN content + fallback)               │
│     ├── kimi-config.ts (Kimi plugin + Kimi Search)           │
│     ├── skill-store.ts (clawhub marketplace integration)     │
│     ├── cli-integration.ts (CLI wrapper + PATH injection)    │
│     ├── launch-at-login.ts (system startup toggle)           │
│     ├── channel-pairing-monitor.ts (unified multi-channel)   │
│     │     ├── channel-pairing-store.ts (persistent storage)  │
│     │     ├── feishu-pairing-monitor.ts (Feishu channel)     │
│     │     ├── wecom-config.ts (WeCom channel)                │
│     │     ├── dingtalk-config.ts (DingTalk channel)          │
│     │     └── qqbot-config.ts (QQ Bot channel)               │
│     ├── update-banner-state.ts (update UI state machine)     │
│     ├── gateway-rpc.ts (WebSocket RPC to gateway)            │
│     ├── build-config.ts (build-time injected config)         │
│     ├── analytics.ts + analytics-events.ts (telemetry)       │
│     ├── auto-updater.ts (CDN updates + progress)             │
│     ├── gateway-auth.ts (token management)                   │
│     └── logger.ts (file + console)                           │
│                                                              │
│  preload.ts ─── contextBridge (~72 IPC + 5 listeners)        │
└──────────────────┬───────────────────────────────────────────┘
                   │
     ┌─────────────┴─────────────┐
     │   Gateway Child Process   │
     │   Node.js 22 + openclaw   │
     │   :configurable loopback  │
     └─────────────┬─────────────┘
                   │ HTTP + WebSocket
     ┌─────────────┴─────────────┐
     │      BrowserWindow        │
     │  loads Lit Chat UI from   │
     │  file:// (chat-ui/dist/)  │
     └───────────────────────────┘
```
