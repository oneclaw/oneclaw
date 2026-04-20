# Common Gotchas

Things that are easy to get wrong or forget when working on OneClaw.

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

27. **Client-side polling uses shared ticker.** All periodic polling in Chat UI must go through the 60s `client-ticker.ts` mechanism (`registerTickHandler`/`unregisterTickHandler`). Do not create standalone `setInterval` calls. See [client-ticker.md](client-ticker.md).

28. **Tooltips must use the global fixed-position approach.** Never use CSS `::after` pseudo-elements for tooltips — they get clipped by any parent with `overflow: auto/hidden`. Use the shared `.fixed-tooltip` DOM element with JS event delegation (`mouseover` + `getBoundingClientRect()`). Chat UI initializes it in `main.ts`, Settings in `settings.js`. Just add `data-tooltip="text"` to any element. Use `data-tooltip-pos="bottom"` for downward tooltips.

29. **Design tokens are the single source of truth.** All CSS variables (colors, radii, shadows, fonts, transitions) live in `shared/design-tokens.css`. Chat UI, Settings, and Setup all `@import` this file. Never hardcode color values or `border-radius` in component styles — use tokens. Never use `transition: all` — specify exact properties.

30. **Scrollbars must use native overlay behavior — declare nothing.** Any scrollbar styling forces Chromium out of overlay mode on macOS, making scrollbars permanently visible. This includes both `::-webkit-scrollbar{,-thumb,-track}` AND the standard `scrollbar-width` / `scrollbar-color` properties when set to concrete values. The only way to preserve the native "show on scroll, auto-hide when idle" behavior is to not declare any scrollbar rules at all. `scrollbar-width: none` is still allowed for places that intentionally hide the scrollbar (like the nav bar).

31. **Weixin QR success must atomically enable the channel.** Writing `~/.openclaw/openclaw-weixin/accounts/*.json` alone is not enough. If `plugins.entries.openclaw-weixin.enabled` and `channels.openclaw-weixin.enabled` are not written in the same success path, Settings can show "已连接" while the Gateway never starts the Weixin channel, so no replies are sent.

32. **Windows `shouldPreferNativeJiti` is hard-wired to false — dingtalk cannot live on the external-plugin path.** In openclaw 2026.4.5 `dist/sdk-alias-*.js`, `shouldPreferNativeJiti()` unconditionally returns `false` on `process.platform === "win32"`. This forces every `.mjs` plugin loaded through the external plugin scanner (`~/.openclaw/extensions/<id>/`) to go through jiti transform mode instead of Node's native ESM cache. The plugin loader re-evaluates the bundle on each top-level invocation (~115 times/hour observed on an idle dingtalk), which re-runs `register()`. Idempotent `register` is fine (`openclaw-weixin`, `wecom-openclaw-plugin`), but **dingtalk-connector's register creates a new `DWSClient` stream per call, all sharing the same `clientId`** — the DingTalk server kicks/ghosts the flood of duplicate handlers and phone messages silently stop being delivered. For this reason dingtalk **must** stay in the bundled path (`gateway.asar/node_modules/openclaw/dist/extensions/dingtalk-connector`) via the createRequire-based channel-entry shim: the shim itself can be jiti-re-eval'd N times, but `createRequire` routes the inner `legacyModule` load through Node's process-wide require cache, so DWS is created exactly once. macOS `shouldPreferNativeJiti` returns true for `.mjs`, so the external path works there — but it is not a safe basis for channel plugins with non-idempotent register. See PR #79 `d58c0be` and `scripts/package-resources.js#writeChannelEntryShim`.

33. **Built-in channel plugin entries can be shadowed by `plugins.allow`.** For bundled channels such as Feishu, a non-empty `plugins.allow` can disable a legacy `plugins.entries.<channel>.enabled=true` entry when the channel id is absent from the allowlist, even if `channels.<channel>.enabled=true` is present. Extension mirror writes `plugins.allow` for external mirrored plugins at startup, so avoid leaving redundant built-in channel entries that can mask the channel-enabled activation path.

34. **Setup's `#view=setup` fragment must survive reloads until setup completes.** The renderer intentionally does not persist `oneclawView: "setup"` to localStorage, so the URL fragment is the only reload-safe signal while `WindowManager.setupPending` is true. Do not strip `view=setup` during initial URL cleanup; remove it only when the app leaves Setup.

35. **DingTalk saves must strip deprecated channel fields on both enable and disable.** `dingtalk-connector` rejects `gatewayToken` and `sessionTimeout` under the openclaw 2026.4.x schema. Disabling DingTalk is often the recovery path for a bad config, so the disabled save path must also remove those fields instead of preserving the old channel object verbatim.

36. **POSIX CLI PATH injection must cover login and interactive shells.** macOS Terminal usually reads `~/.zprofile`, but VS Code Terminal and some iTerm/zsh setups only read `~/.zshrc`; bash has the same split between `~/.bash_profile` and `~/.bashrc`. Install the `oneclaw` PATH block into all four files (`.zprofile`, `.zshrc`, `.bash_profile`, `.bashrc`) so users can run `openclaw` after opening a new terminal.

37. **Chrome browser mode must not point at the old `chrome-relay` profile on openclaw 2026.4.x.** The Chrome extension relay driver/profile existed in older openclaw builds, but 2026.4.x uses the built-in `user` existing-session profile for host Chrome. If Settings writes `browser.defaultProfile: "chrome-relay"` without a valid profile, the browser control root returns `BrowserProfileNotFoundError`; if users copy the token into the old extension, they may also hit the wrong derived browser-control port. Migrate missing or legacy `driver: "extension"` profiles to `user`.

38. **Session delete goes synchronous with per-row spinner — no tombstone queue.** Click → `sessions.reset` → `sessions.delete` → `loadSessions` refresh, all awaited inline. Each row tracks its own in-flight state via a module-level `deletingSessionKeys: Set<string>` so the delete button swaps to a spinning `icons.loader` and disables clicks while work is in flight; other rows stay interactive. With `session-memory` hook enabled the reset step triggers an LLM summary (400-600KB jsonl can take 10-90s on CN providers), so the spinner window is long and the same WebSocket serializes concurrent deletes — acceptable, but don't try to "optimize" with optimistic filter or persisted hidden/pending queues: both pathways were tried and re-introduce resurrection bugs when the UI hides a key the gateway still owns.
