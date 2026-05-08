<!-- officecli-pptx reference -->
# Known Issues

| Issue | Workaround |
|---|---|
| **Chart series cannot be added after creation**: `set --prop data=` and `set --prop seriesN=` on an existing chart can only update existing series -- they cannot add new series. The series count is fixed at creation time. | Include all series in the `add` command (using `series1`+`series2` props or the `data` prop). Both forms work reliably in single commands and in batch mode. If you need to add series to an existing chart, delete it and recreate: `officecli remove file.pptx "/slide[N]/chart[M]"` then `officecli add` with all series. See creating.md "Multi-Series Column Chart" and editing.md "Update Charts". |
| **Chart schema validation warning**: Some modern chart styling combinations produce a `ChartShapeProperties` schema warning from `officecli validate`. This does not affect PowerPoint rendering. | Ignore the warning if the chart opens correctly in PowerPoint. |
| **Table font cascade overwritten by row set**: Setting `size`/`font` on the table path and then setting row content with `set tr[N]` resets font properties on that row to defaults. | Set table-level `size`/`font` **after** all row content is populated, or include `size`/`font` in each row-level `set` command. |
| **Shell quoting in batch JSON**: piping JSON via `echo '...' \| officecli batch` fails when JSON values contain apostrophes or `$` characters (common in English text and currency), and any stdin-pipe approach (heredoc, `echo \|`, `Get-Content \|`) fails outright on Windows PowerShell. | Author the batch with the `Write` tool (`batch.json`) and run `officecli batch <file.pptx> --input batch.json`. The JSON file is read directly, so shell quoting/interpolation never touches the payload. |
| **Batch intermittent failure**: Approximately 1-in-15 batch operations may fail with "Failed to send to resident" when using batch mode with resident mode (`open`/`close`). | Retry the failed batch command. If the error persists, close and re-open the file: `officecli close file.pptx && officecli open file.pptx`, then retry. For critical workflows, consider splitting large batch arrays into smaller chunks (10-15 operations each). |
| **Table cell solidFill schema warning**: Setting `color` on table cell run properties may produce `solidFill` schema validation errors. The table renders correctly in PowerPoint. | Ignore if the table opens correctly. Alternatively, set text color at the row level (`set tr[N] --prop color=HEX`) instead of the cell level. |
| **Multi-series chart rendering in SVG/screenshot**: SVG and screenshot renders may show fewer series than actually exist in the chart data. The chart data is correct but the rendering engine does not always display all series visually. | Verify multi-series charts by opening the .pptx in PowerPoint or by using `get /slide[N]/chart[M]` to confirm all series are present in the data. Do not rely solely on SVG/screenshot visual QA for multi-series verification. |
| **Slide titles show as "(untitled)" in `view outline` / `view issues`**: When using `layout=blank` (the recommended approach for custom designs), all titles are added as plain text boxes — not as PPTX title placeholder elements. As a result, `view outline` and `view issues` report "(untitled)" for every slide, and screen reader outline navigation will not find slide titles. This is **expected behavior** for blank-layout decks. Evaluators and testers should not flag this as a defect when the deck uses `layout=blank`. If outline-compatible titles are required, use `officecli set deck.pptx "/slide[N]/placeholder[title]" --prop text="Title"` to set the PPTX title placeholder — but note this requires a layout that includes a title placeholder (i.e., not `layout=blank`). |

## EBUSY: resource busy or locked

When `officecli` reports something like:

```json
{"status":"error","tool":"edit","error":"EBUSY: resource busy or locked, open 'C:\\\\Users\\\\you\\\\.openclaw\\\\workspace\\\\deck.pptx'"}
```

another process holds a write handle on the file. This is most common on Windows; on macOS the same condition surfaces as `EACCES` or `ETXTBSY`. Work through these checkpoints **in order** — each one is cheaper than the next:

1. **Close any viewer.** PowerPoint, WPS Office, LibreOffice Impress, Keynote, and the Windows File Explorer preview pane all keep an exclusive write lock on the open `.pptx`. Close every window that might have the file open and retry. This is by far the most common cause.

2. **Pause cloud sync.** OneDrive, Dropbox, iCloud Drive, and Google Drive hold a write handle while uploading, especially right after `officecli close` writes the file. The OneClaw workspace `~/.openclaw/workspace/` is often inside `C:\Users\<name>\OneDrive\...` on Windows. Pause sync (taskbar icon → Pause syncing) and retry. After the workflow finishes, resume sync.

3. **Antivirus / Windows Defender real-time scan.** Defender opens the file briefly after every write. If EBUSY is **intermittent** (succeeds on retry within a couple of seconds), this is the cause. Wait 1–2s and retry once.

4. **Stale resident daemon.** If a previous workflow ran `officecli open file.pptx` and then crashed or was interrupted, the resident daemon may still hold the file. Run `officecli close file.pptx` (it is idempotent — safe even if no daemon is running). On Windows, if `close` reports nothing to close but EBUSY persists, kill any leftover `officecli` processes via Task Manager.

5. **Do not interleave resident and non-resident commands.** If you start a workflow with `officecli open deck.pptx`, every subsequent command on `deck.pptx` must go through the resident daemon (i.e. plain `officecli add/set/...` invocations route through the daemon automatically) — never re-open the same file from another shell, and never run a `batch` against the same file path while the daemon is running, which can race with the daemon's write handle. End every resident-mode session with `officecli close deck.pptx` before any direct file invocation.

6. **Retry once with a small delay, then escalate.** If steps 1–5 do not resolve the lock, wait 2–3 seconds and retry the failed command **once**. If it still fails, stop the workflow, report the file path to the user, and ask which application might have it open. **Do not loop** retries — that masks the real problem.

> Quick recovery sequence (Windows PowerShell, safe to copy-paste):
>
> ```bash
> officecli close deck.pptx
> # close viewers, pause OneDrive, then retry the failing command
> officecli batch deck.pptx --input batch.json
> ```
