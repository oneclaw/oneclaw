# OneClaw — Electron Shell for openclaw

## What This Project Is

OneClaw is a cross-platform desktop app that wraps the [openclaw](https://github.com/openclaw/openclaw) gateway into a standalone installable package. It ships a bundled Node.js 22 runtime and the openclaw npm package, so users need zero dev tooling — just install and run.

**Three-process architecture:**

```
Electron Main Process
  ├── Gateway child process  (Node.js 22 → openclaw entry.js, port configurable, default 18789)
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
| Version scheme | Calendar-based: `YYYY.MMDD.N` (e.g. `2026.318.0`), auto-derived from git tag |

## Repository Layout

```
oneclaw/
├── src/                    # 35 TypeScript modules (10270 LOC) + 13 test files
│   ├── main.ts             # App entry, lifecycle, IPC, Dock toggle, config recovery
│   ├── constants.ts        # Path resolution (dev vs packaged vs ASAR), health check params
│   ├── gateway-process.ts  # Child process state machine + diagnostics
│   ├── gateway-auth.ts     # Auth token read/generate/persist
│   ├── gateway-rpc.ts      # WebSocket RPC client for main↔gateway communication
│   ├── window.ts           # BrowserWindow lifecycle, token injection, retry
│   ├── window-close-policy.ts  # Close behavior: hide vs destroy
│   ├── tray.ts             # System tray icon + i18n context menu
│   ├── preload.ts          # contextBridge IPC whitelist (~75 methods + 5 listeners)
│   ├── provider-config.ts  # Provider presets, verification, config R/W
│   ├── setup-manager.ts    # Setup wizard window lifecycle
│   ├── setup-ipc.ts        # Setup validation + config write + CLI install
│   ├── setup-completion.ts # Setup wizard completion detection
│   ├── install-detector.ts # Setup Step 0: installation conflict detection
│   ├── oneclaw-config.ts   # OneClaw ownership config (deviceId, setupCompletedAt, migration)
│   ├── settings-ipc.ts     # Settings CRUD, backup/restore, Kimi, CLI, advanced
│   ├── config-backup.ts    # Rolling backups + last-known-good snapshot + restore
│   ├── share-copy.ts       # Remote share copy content (CDN fetch + local fallback)
│   ├── kimi-config.ts      # Kimi robot plugin + Kimi Search configuration
│   ├── kimi-oauth.ts       # Kimi OAuth device code login + token refresh
│   ├── skill-store.ts      # Skill marketplace (clawhub CLI integration)
│   ├── build-config.ts     # Build-time injected config reader (PostHog, registry URL)
│   ├── cli-integration.ts  # CLI wrapper generation, PATH injection (POSIX + Windows)
│   ├── launch-at-login.ts  # macOS/Windows launch at login toggle
│   ├── channel-pairing-store.ts    # Per-channel approved-user sidecar (allowFrom storage)
│   ├── wecom-config.ts     # WeCom (企业微信) plugin config
│   ├── weixin-config.ts    # WeChat (微信) plugin config
│   ├── dingtalk-config.ts  # DingTalk connector plugin config
│   ├── qqbot-config.ts     # QQ Bot plugin config
│   ├── update-banner-state.ts     # Update banner pure state machine
│   ├── analytics.ts        # Telemetry (PostHog-style, retry + fallback URL)
│   ├── analytics-events.ts # Event classification + property sanitization
│   ├── auto-updater.ts     # electron-updater wrapper + progress callback
│   └── logger.ts           # Dual-write logger (file + console)
├── chat-ui/                # Lit-based Chat UI SPA (file:// loaded, ~35K LOC)
│   └── ui/                 # Vite project: Lit 3 components, sidebar, settings view, model selector
├── setup/                  # Setup wizard frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # Multi-step wizard with data-i18n attributes
│   ├── setup.css           # Dark/light theme via prefers-color-scheme
│   ├── setup.js            # i18n dict (en/zh) + form logic
│   └── lucide-sprite.generated.js  # Icon sprites
├── settings/               # Settings page frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # Provider, Search, Channels, KimiClaw, Appearance, Advanced, Backup tabs
│   ├── settings.css        # Dark/light theme via prefers-color-scheme
│   ├── settings.js         # Provider CRUD, multi-channel, Kimi, CLI, backup/restore
│   ├── lucide-sprite.generated.js  # Icon sprites
│   └── share-copy-content.json     # Fallback share copy content
├── scripts/
│   ├── package-resources.js    # Downloads Node.js 22 + installs openclaw from npm
│   ├── afterPack.js            # electron-builder hook: injects resources post-strip
│   ├── run-mac-builder.js      # macOS build wrapper (sign + notarize)
│   ├── run-with-env.js         # .env loader for child processes
│   ├── merge-release-yml.js    # Merges per-arch latest.yml for auto-updater
│   ├── generate-settings-icons.js  # Lucide icon sprite generator
│   ├── installer.nsh           # NSIS custom installer script
│   ├── lib/                    # Shared script utilities
│   ├── dist-all-parallel.sh    # Parallel cross-platform build
│   └── clean.sh
├── assets/                 # Icons: .icns, .ico, .png, tray templates
├── docs/                   # Plans, design guidelines, architecture docs
├── .github/workflows/      # CI: build-release.yml + publish-release.yml + publish-share-copy.yml
├── electron-builder.yml    # Build config (DMG + ZIP for mac, NSIS for win)
├── tsconfig.json           # target ES2022, module CommonJS
└── .env                    # Signing keys + build config (gitignored)
```

**Generated at build time (all gitignored):**

```
resources/targets/<platform-arch>/   # Per-target Node.js + gateway deps
  ├── runtime/node[.exe]             # Node.js 22 binary
  ├── gateway/                       # openclaw production node_modules (散文件)
  ├── gateway.asar                   # Gateway ASAR archive (CI 构建产物)
  ├── gateway.asar.unpacked/         # ASAR unpacked files (native modules, extensions)
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

**Isolated local startup using production config** (skip Setup):

```bash
# First run, or refresh from production config:
rm -f .dev-state/dev.pid .dev-state/oneclaw.config.json .dev-state/openclaw.json .dev-state/openclaw.json.bak .dev-state/logs/config-health.json
npm run dev:isolated

# Cleanup after the test run:
rm -rf .dev-state && npm run clean && rm -rf chat-ui/dist tsconfig.tsbuildinfo
```

- `dev:isolated` runs with `ONECLAW_MULTI_INSTANCE=1`, `OPENCLAW_STATE_DIR=.dev-state`, and a deterministic gateway port in `19000-19999`.
- On a fresh `.dev-state`, it copies `~/.openclaw/oneclaw.config.json`, `~/.openclaw/openclaw.json`, and credentials, then rewrites `agents.defaults.workspace` to `.dev-state/workspace` so tests do not write into the production workspace.
- Setup is skipped when `.dev-state/oneclaw.config.json` contains `setupCompletedAt`; use `npm run dev:isolated -- --with-setup` only when testing the Setup Wizard.

**Full build pipeline** (what `dist:mac:arm64` does):

1. `package:resources` — download Node.js 22, `npm install openclaw --production --install-links` (version auto-fetched from npm), optionally create `gateway.asar` (set `ONECLAW_GATEWAY_ASAR=1`)
2. `build:chat` — Vite builds Lit Chat UI into `chat-ui/dist/`
3. `tsc` — compile TypeScript
4. `electron-builder` → `afterPack.js` injects `resources/targets/<target>/` into app bundle → DMG/ZIP/NSIS

## Key Design Decisions

> Detailed per-module design documentation: [docs/architecture.md](docs/architecture.md)
> Full IPC API reference: [docs/ipc-api.md](docs/ipc-api.md)

**Core subsystems at a glance:**

- **Gateway process** — State machine (`stopped→starting→running→stopping`) with generation tracking to prevent stale exit events. 3 retries on startup, 90s health check timeout, auto-restart on config change.
- **Token injection** — Auth token passed to gateway via env var, injected into BrowserWindow via URL fragment (`#token=...`).
- **Provider config** — Unified module shared by Setup + Settings. All Moonshot sub-platforms (moonshot-cn/ai/kimi-code) write `apiKey`+`baseUrl`+`api`+`models` to `models.providers`.
- **Kimi OAuth** — Device code flow via `auth.kimi.com`, 60s refresh interval, 300s refresh threshold.
- **Setup wizard** — Step 0 (conflict detection) → Step 1 (welcome) → Step 2 (provider) → Step 3 (done + CLI + login toggle).
- **Settings** — 7 tabs: Provider, Search, Channels, KimiClaw, Appearance, Advanced, Backup.
- **Multi-channel integration** — Feishu / WeCom / DingTalk / QQ Bot / WeChat share a common plugin-enable + channel-config schema. New installs default `dmPolicy: "open"` (with `allowFrom: ["*"]`). Users can opt into `dmPolicy: "pairing"` per channel; approved-user list is maintained via an allowFrom sidecar (no background polling).
- **Skill store** — clawhub CLI integration, skills at `~/.openclaw/workspace/skills/`, registry config in `~/.openclaw/skill-store.json`.
- **Config backup** — Rolling 10 backups + last-known-good snapshot + factory reset.
- **Multi-model management** — IPC handlers for listing, deleting, setting default, and aliasing models across providers.
- **Gateway ASAR packaging** — Optional `gateway.asar` archive (enabled by `ONECLAW_GATEWAY_ASAR=1`) reduces 5000+ files to a single archive for faster Windows installs. Patched openclaw boundary check for ASAR paths. Extensions unpacked to `gateway.asar.unpacked/`.
- **Preload security** — ~75 IPC methods + 5 event listeners via `contextBridge` (sandbox mode).

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
  ├── workspace/
  │   └── skills/                      # Installed skills (via clawhub)
  ├── skill-store.json                 # Skill store registry config (standalone)
  └── bin/
      ├── openclaw                     # CLI wrapper script (POSIX) or .cmd (Windows)
      └── clawhub                      # clawhub CLI wrapper
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

See [docs/gotchas.md](docs/gotchas.md) for the full list (29 items covering packaging, signing, config, tooltip, design tokens, etc.).

When you encounter a non-trivial problem and find a working solution, add it to `docs/gotchas.md` so future developers don't repeat the same investigation.
