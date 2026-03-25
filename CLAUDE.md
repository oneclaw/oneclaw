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
│   ├── channel-pairing-monitor.ts  # Unified multi-channel pairing polling + state
│   ├── channel-pairing-store.ts    # Per-channel pairing approval persistence
│   ├── feishu-pairing-monitor.ts   # Feishu-specific pairing monitor
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
- **Multi-channel integration** — Unified pairing monitor aggregates Feishu, WeCom, DingTalk, QQ Bot with per-channel state tracking and auto-approval.
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

1. **`npm install file:` creates symlinks, not copies.** Always use `--install-links` for physical copy. This is critical for electron-builder packaging.

2. **Cross-platform build needs re-packaging.** After switching target platform, `npm run package:resources` must run again because the Node.js binary and native modules differ per platform.

3. **All Kimi sub-platforms use unified config.** All three (moonshot-cn, moonshot-ai, kimi-code) write `apiKey` + `baseUrl` + `api` + `models` to `models.providers`. No special-casing.

4. **Health check timeout is 90 seconds.** This is intentionally long for Windows. Don't reduce it without testing on slow machines.

5. **Tray app behavior.** Closing the window hides it; the app stays in the tray. `Cmd+Q` (or Quit from tray menu) actually quits. macOS Dock icon hides automatically when no windows are visible.

6. **macOS signing.** By default uses ad-hoc identity (`-`). Set `ONECLAW_MAC_SIGN_AND_NOTARIZE=true` + `CSC_NAME`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` in `.env` for real signing.

7. **Version is auto-derived from git tag.** Format: `YYYY.MMDD.N` (e.g. `v2026.318.0`). `package.json` stays `0.0.0-dev`; CI extracts version from tag via `npm version`. Never manually edit `package.json` version.

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

19. **Skill store config is standalone.** Registry URL stored in `~/.openclaw/skill-store.json`, not in gateway config. Skills installed to `~/.openclaw/workspace/skills/`, not `~/.openclaw/skills/`.

20. **CLI wrapper invokes bundled Node.js.** The wrapper scripts use the real bundled Node.js binary from the app package, not the system node.

21. **Token injection uses URL fragment.** Gateway auth token is passed via `#token=...` in the loaded URL, not query parameter or localStorage.

22. **Build config replaces analytics config.** `build-config.json` (renamed from `analytics-config.json`) is injected at build time and read by `build-config.ts`. Contains PostHog key, clawhub registry, and other build constants.

23. **Gateway ASAR mode requires patched boundary check.** `package-resources.js` patches openclaw's `openBoundaryFileSync()` to skip validation for `.asar` paths. Without this patch, the plugin security check rejects ASAR virtual paths and gateway fails to start.

24. **ASAR mode changes path resolution.** `resolveGatewayRoot()` auto-detects `gateway.asar` vs `gateway/` directory. ASAR mode: `resolveGatewayCwd()` returns `~/.openclaw/` (OS can't chdir into ASAR). Gateway subprocess uses Electron binary + `ELECTRON_RUN_AS_NODE` to read ASAR transparently. CLI interactive mode on Windows requires a CONSOLE subsystem binary (Electron is GUI subsystem, cannot hold interactive TTY).

25. **Windows uses assisted installer.** NSIS `oneClick: false` mode enables installation directory selection and custom uninstall options. `installer.nsh` provides CLI cleanup and user data removal checkboxes. `createDesktopShortcut: "always"` ensures shortcut is recreated on update.

26. **Windows CLI wrapper lives in `%LOCALAPPDATA%\OneClaw\bin\`.** Not in `~/.openclaw/bin/` like POSIX. Legacy path migration handles old users who had wrappers in `~/.openclaw/bin/`.

27. **Client-side polling uses shared ticker.** All periodic polling in Chat UI must go through the 60s `client-ticker.ts` mechanism (`registerTickHandler`/`unregisterTickHandler`). Do not create standalone `setInterval` calls. See [docs/client-ticker.md](docs/client-ticker.md).
