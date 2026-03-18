; OneClaw NSIS 自定义钩子
; 功能：安装前杀进程、卸载时提供 CLI 清理和用户数据删除选项

; ============================================================
; 安装钩子
; ============================================================

!macro customInit
  ; 安装前强制终止正在运行的 OneClaw 进程树（/T 杀子进程，/F 强制）
  nsExec::ExecToLog 'taskkill /IM "OneClaw.exe" /T /F'
  ; 补杀残留的 gateway 子进程（OneClaw Helper.exe 是 Electron 复用二进制跑 Node.js 的）
  ; /T 有时无法级联到 windowsHide 模式创建的子进程，需显式按进程名清理
  nsExec::ExecToLog 'taskkill /IM "OneClaw Helper.exe" /F'
  ; 等待进程退出和文件句柄释放
  Sleep 2000
!macroend

; ============================================================
; 卸载钩子
; ============================================================

; 卸载初始化：杀进程（与安装前逻辑相同）
!macro customUnInit
  nsExec::ExecToLog 'taskkill /IM "OneClaw.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "OneClaw Helper.exe" /F'
  Sleep 2000
!macroend

; 卸载组件选择页：NSIS 自动渲染为勾选框列表
; 注意：customUnInstallSection 在 electron-builder 的 customUnInstall 之后执行
!macro customUnInstallSection
  ; 默认勾选：删除 CLI wrapper 和 PATH 注入
  Section "un.删除命令行工具 (openclaw CLI)"
    ; 删除当前版本 wrapper（%LOCALAPPDATA%\OneClaw\bin\）
    Delete "$LOCALAPPDATA\OneClaw\bin\openclaw.cmd"
    Delete "$LOCALAPPDATA\OneClaw\bin\clawhub.cmd"
    RMDir "$LOCALAPPDATA\OneClaw\bin"
    RMDir "$LOCALAPPDATA\OneClaw"

    ; 删除旧版 wrapper（%USERPROFILE%\.openclaw\bin\）
    Delete "$PROFILE\.openclaw\bin\openclaw.cmd"
    Delete "$PROFILE\.openclaw\bin\clawhub.cmd"
    RMDir "$PROFILE\.openclaw\bin"

    ; 写入临时 PowerShell 脚本，从用户级 PATH 移除 bin 目录
    ; 逻辑与 cli-integration.ts buildWinPathEnvScript("remove") 保持一致
    FileOpen $0 "$TEMP\oneclaw-uninstall-path.ps1" w
    FileWrite $0 "function Remove-FromPath([string]$$target) {$\r$\n"
    FileWrite $0 "  $$current = [Environment]::GetEnvironmentVariable('Path', 'User')$\r$\n"
    FileWrite $0 "  if (-not $$current) { return }$\r$\n"
    FileWrite $0 "  $$parts = $$current -split ';' | ForEach-Object { $$_.Trim() } | Where-Object { $$_ -ne '' }$\r$\n"
    FileWrite $0 "  try { $$tn = ([System.IO.Path]::GetFullPath($$target)).TrimEnd('\').ToLowerInvariant() } catch { $$tn = $$target.Trim().TrimEnd('\').ToLowerInvariant() }$\r$\n"
    FileWrite $0 "  $$filtered = @()$\r$\n"
    FileWrite $0 "  foreach ($$p in $$parts) {$\r$\n"
    FileWrite $0 "    try { $$n = ([System.IO.Path]::GetFullPath($$p)).TrimEnd('\').ToLowerInvariant() } catch { $$n = $$p.Trim().TrimEnd('\').ToLowerInvariant() }$\r$\n"
    FileWrite $0 "    if ($$n -ne $$tn) { $$filtered += $$p }$\r$\n"
    FileWrite $0 "  }$\r$\n"
    FileWrite $0 "  [Environment]::SetEnvironmentVariable('Path', ($$filtered -join ';'), 'User')$\r$\n"
    FileWrite $0 "}$\r$\n"
    FileWrite $0 "Remove-FromPath $$env:LOCALAPPDATA\OneClaw\bin$\r$\n"
    FileWrite $0 "Remove-FromPath $$env:USERPROFILE\.openclaw\bin$\r$\n"
    FileClose $0

    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\oneclaw-uninstall-path.ps1"'
    Delete "$TEMP\oneclaw-uninstall-path.ps1"
  SectionEnd

  ; 默认不勾选（/o）：删除用户数据和配置，防止误删
  Section /o "un.删除所有用户数据和配置 (~/.openclaw)"
    ; 整个 ~/.openclaw/ 目录：配置、日志、凭据、备份、技能、对话历史
    RMDir /r "$PROFILE\.openclaw"
  SectionEnd
!macroend
