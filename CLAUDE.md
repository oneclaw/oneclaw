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
| Updater | electron-updater (generic provider, CDN at `claw.ver0.cn`) |
| Targets | macOS DMG (arm64/x64), Windows NSIS (x64/arm64) |
| Version scheme | Calendar-based: `2026.2.10` (synced from upstream openclaw) |

## Repository Layout

```
oneclaw/
├── src/                    # 12 TypeScript modules (1619 LOC total)
│   ├── main.ts             # App entry, lifecycle, IPC registration
│   ├── constants.ts        # Path resolution (dev vs packaged), health check params
│   ├── gateway-process.ts  # Child process state machine + diagnostics
│   ├── gateway-auth.ts     # Auth token read/generate/persist
│   ├── window.ts           # BrowserWindow lifecycle, token injection, retry
│   ├── tray.ts             # System tray icon + context menu
│   ├── preload.ts          # contextBridge IPC whitelist (7 methods)
│   ├── setup-manager.ts    # Setup wizard window lifecycle
│   ├── setup-ipc.ts        # Provider validation + config write
│   ├── analytics.ts        # Telemetry (PostHog-style events)
│   ├── auto-updater.ts     # electron-updater wrapper
│   └── logger.ts           # Dual-write logger (file + console)
├── setup/                  # Setup wizard frontend (vanilla HTML/CSS/JS)
│   ├── index.html          # 3-step wizard with data-i18n attributes
│   ├── setup.css           # Dark theme, drag region
│   └── setup.js            # i18n dict (en/zh) + form logic
├── scripts/
│   ├── package-resources.js    # Downloads Node.js 22 + installs openclaw deps
│   ├── afterPack.js            # electron-builder hook: injects resources post-strip
│   ├── sync-openclaw-version.js # Syncs version from upstream/openclaw
│   ├── run-mac-builder.js      # macOS build wrapper (sign + notarize)
│   ├── run-with-env.js         # .env loader for child processes
│   ├── dist-all-parallel.sh    # Parallel cross-platform build
│   ├── clean.sh
│   └── lib/openclaw-version-utils.js
├── assets/                 # Icons: .icns, .ico, .png, tray templates
├── upstream/               # openclaw source (gitignored, cloned separately)
├── electron-builder.yml    # Build config
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
npm run package:resources    # Download Node.js 22 + install openclaw
npm run dist:mac:arm64       # Full pipeline: sync version → package → DMG (arm64)
npm run dist:mac:x64         # Same for x64
npm run dist:win:x64         # Windows NSIS x64 (cross-compile from macOS works)
npm run dist:win:arm64       # Windows NSIS arm64
npm run dist:all:parallel    # Build all 4 targets in parallel
npm run clean                # Remove all generated files
```

**Full build pipeline** (what `dist:mac:arm64` does):
1. `version:sync` — read version from `upstream/openclaw/package.json`, write to root `package.json`
2. `package:resources` — download Node.js 22, `npm install openclaw --production --install-links`
3. `tsc` — compile TypeScript
4. `electron-builder` → `afterPack.js` injects `resources/targets/<target>/` into app bundle → DMG/NSIS

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

### Setup Wizard (`setup-ipc.ts`, `setup/`)

First-launch 3-step wizard: Welcome → Provider Config → Done.

Supported providers:
- **Anthropic** — standard Anthropic Messages API
- **Moonshot** — 3 sub-platforms: `moonshot-cn`, `moonshot-ai`, `kimi-code`
- **OpenAI** — OpenAI completions API
- **Google** — Google Generative AI
- **Custom** — user-supplied base URL + API type

**Kimi Code special case:** Does NOT write `models.providers` entry. Only writes `env.KIMI_API_KEY` + `agents.defaults.model.primary = "kimi-coding/k2p5"`. This lets the gateway's built-in config handle the provider routing.

Config is written to `~/.openclaw/openclaw.json`. Setup completion is marked by `config.wizard.lastRunAt`.

### Incremental Resource Packaging (`package-resources.js`)

A stamp file (`resources/targets/<target>/.node-stamp`) records `version-platform-arch`. If stamp matches, skip download. Cross-platform builds (e.g., building win32-x64 on darwin-arm64) auto-detect the mismatch and re-download.

Node.js download mirrors: npmmirror.com (China) first, nodejs.org fallback.

### afterPack Hook (`afterPack.js`)

electron-builder strips `node_modules` during packaging. The afterPack hook injects the pre-built gateway resources from `resources/targets/<target>/` into the final app bundle **after** stripping, bypassing the strip logic entirely.

Target ID resolution: env `ONECLAW_TARGET` > `${electronPlatformName}-${arch}`.

### Preload Security (`preload.ts`)

Electron 40 defaults to sandbox mode. Only 7 IPC methods are exposed via `contextBridge`:

```
restartGateway, getGatewayState, checkForUpdates,
verifyKey, saveConfig, completeSetup, openExternal
```

`openExternal` exists because `shell.openExternal` is unavailable in sandboxed preload — must go through IPC to main process.

## Runtime Paths (on user's machine)

```
~/.openclaw/
  ├── openclaw.json     # User config (provider, model, auth token)
  ├── .device-id        # Analytics device ID (UUID)
  ├── app.log           # Application log (5MB truncate)
  └── gateway.log       # Gateway child process diagnostic log
```

## Common Gotchas

1. **`npm install file:` creates symlinks, not copies.** Always use `--install-links` for physical copy. This is critical for electron-builder packaging.

2. **Cross-platform build needs re-packaging.** After switching target platform, `npm run package:resources` must run again because the Node.js binary and native modules differ per platform.

3. **Kimi Code provider config is special.** Don't write `models.providers` — let gateway built-in config handle it. Only set the env var and default model.

4. **Health check timeout is 90 seconds.** This is intentionally long for Windows. Don't reduce it without testing on slow machines.

5. **Tray app behavior.** Closing the window hides it; the app stays in the tray. `Cmd+Q` (or Quit from tray menu) actually quits.

6. **macOS signing.** By default uses ad-hoc identity (`-`). Set `ONECLAW_MAC_SIGN_AND_NOTARIZE=true` + `CSC_NAME`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` in `.env` for real signing.

7. **Version is calendar-based** (`2026.2.10`), synced from upstream openclaw. Don't manually edit `package.json` version — use `npm run version:sync`.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                 Electron Main Process                │
│                                                     │
│  main.ts ─── gateway-process.ts ─── constants.ts    │
│     │              │                     │          │
│     │         spawn child ──────── path resolution  │
│     │              │                                │
│     ├── window.ts (BrowserWindow + token inject)    │
│     ├── tray.ts   (system tray + menu)              │
│     ├── setup-manager.ts + setup-ipc.ts (wizard)    │
│     ├── analytics.ts (telemetry)                    │
│     ├── auto-updater.ts (CDN updates)               │
│     ├── gateway-auth.ts (token management)          │
│     └── logger.ts (file + console)                  │
│                                                     │
│  preload.ts ─── contextBridge (7 IPC methods)       │
└─────────────────┬───────────────────────────────────┘
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
