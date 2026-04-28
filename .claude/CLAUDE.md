# Development guidelines

## Branch development

All new features and fixes must be developed in a git worktree. Do not commit directly on `main`.

```bash
git worktree add <worktree-path> -b feat/<branch-name>
```

When done, merge into `main`. Before merging:

1. **Rebase onto main**: `git rebase main` so the branch sits on the latest `main`.
2. **Squash commits**: Use `git rebase -i` to fold small commits into a few meaningful ones; do not land many trivial commits on `main`.
3. **Fast-forward merge**: `git checkout main && git merge --ff-only feat/<branch-name>`

Then clean up the worktree:

```bash
git worktree remove <worktree-path>
git branch -D feat/<branch-name>
```

## Local verification

After code changes, run the app locally so the effect is visible. Do not only say “it’s done.”

### Prerequisites

On first setup or after dependency changes, package resources:

```bash
cd <worktree-path>
npm install
npm run package:resources
```

### Start

Start `npm run dev:isolated` in the background (e.g. `run_in_background`) so it does not interfere with the user’s primary OneClaw instance. Note the returned task ID.

On restart, stop the previous background task with `TaskStop` (using the saved task ID), then start a new one. Do not use `pkill` on Electron—the user may have other OneClaw instances running.

### Stop / restart the dev instance

**Follow this order; do not skip steps:**

1. **Stop the background shell**: Call `TaskStop(task_id)` for the task ID returned by `run_in_background`. Save the ID each time; always stop before restarting.
2. **Clear the pid lock**: `rm -f .dev-state/dev.pid` (the dev-isolated script uses a pidfile for a single-instance lock; a stale file blocks the next start).
3. **Start again**: `npm run dev:isolated`

**Do not:**

- Use `pkill -f electron` or `pkill -f OneClaw`—the user may be running other worktree instances.
- Do not `kill <pid>` on Electron directly—stop only via `TaskStop` on the background shell and let the process exit cleanly.

### Verify the Setup flow

If changes touch the Setup wizard, remove the isolated state directory to simulate a fresh install:

```bash
rm -rf .dev-state
npm run dev:isolated
```

### Verify non-Setup features

If changes do not touch Setup (e.g. Settings, Chat UI, tray), copy only the config files you need (do not `cp -r`; `app.log` can be hundreds of MB and hang):

```bash
rm -rf .dev-state
mkdir -p .dev-state/credentials
cp ~/.openclaw/openclaw.json .dev-state/
cp ~/.openclaw/oneclaw.config.json .dev-state/ 2>/dev/null
cp -r ~/.openclaw/credentials/* .dev-state/credentials/ 2>/dev/null
```

Ensure `oneclaw.config.json` includes `setupCompletedAt`, or the app will enter the Setup wizard.

If the gateway fails to start (config invalid), check `.dev-state/openclaw.json` for channels/plugins the current gateway version does not support and remove invalid entries manually.

```bash
npm run dev:isolated
```
