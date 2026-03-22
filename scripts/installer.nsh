; OneClaw NSIS 自定义钩子
; 功能：安装前杀进程、更新时跳过多余页面（只显示进度条）、卸载时提供 CLI 清理和用户数据删除选项

; ============================================================
; 自定义 Welcome 页：更新时自动跳过，首次安装正常显示
; ============================================================

!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_PRE onWelcomePagePre
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ============================================================
; 自定义安装模式：更新时沿用已有安装模式，跳过选择页
; ============================================================

!macro customInstallMode
  ${if} ${isUpdated}
    ${if} $hasPerMachineInstallation == "1"
      StrCpy $isForceMachineInstall "1"
    ${else}
      StrCpy $isForceCurrentInstall "1"
    ${endif}
  ${endif}
!macroend

; ============================================================
; 自定义 Finish 页：更新时自动跳过并启动 app，首次安装显示"运行"勾选框
; ============================================================

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE onFinishPagePre
  !insertmacro MUI_PAGE_FINISH
!macroend

; ============================================================
; customHeader：定义页面 Pre 回调函数
; （函数定义可后置，NSIS 编译期统一解析）
; ============================================================

!macro customHeader
  ; customHeader 在 installer 和 uninstaller 两个 pass 都会展开，
  ; 但这些函数和 $launchLink 变量只在 installer pass 中存在
  !ifndef BUILD_UNINSTALLER
    ; 更新时跳过 Welcome 页
    Function onWelcomePagePre
      ${if} ${isUpdated}
        Abort
      ${endif}
    FunctionEnd

    ; 更新时跳过 Finish 页，直接启动 app
    ; （首次安装走 customFinishPage 中的 StartApp 函数，由 Finish 页 "Run" 勾选框触发）
    Function onFinishPagePre
      ${if} ${isUpdated}
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
        Abort
      ${endif}
    FunctionEnd
  !endif
!macroend

; ============================================================
; 安装钩子
; ============================================================

!macro customInit
  ; 安装前强制终止正在运行的 OneClaw 进程树（/T 杀子进程，/F 强制）
  nsExec::ExecToLog 'taskkill /IM "OneClaw.exe" /T /F'
  ; 补杀残留的 gateway 子进程（OneClaw Helper.exe 是 Electron 复用二进制跑 Node.js 的）
  ; /T 有时无法级联到 windowsHide 模式创建的子进程，需显式按进程名清理
  nsExec::ExecToLog 'taskkill /IM "OneClaw Helper.exe" /F'
  ; 补杀 CLI 进程（更新时可能正在运行）
  nsExec::ExecToLog 'taskkill /IM "OneClaw-CLI.exe" /F'
  ; 等待进程退出和文件句柄释放
  Sleep 2000
!macroend

; ============================================================
; 安装后钩子：生成 CLI 专用二进制（SUBSYSTEM:CONSOLE）
; 复制主 exe 并补丁 PE header，支持交互式 stdin
; ============================================================

!macro customInstall
  ; 设置 INST_DIR 环境变量供 PowerShell 脚本读取安装目录
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$env:INST_DIR=\"$INSTDIR\"; & \"$INSTDIR\resources\create-cli-binary.ps1\""'
!macroend

; ============================================================
; 卸载钩子
; ============================================================

; 卸载初始化：杀进程（与安装前逻辑相同）
!macro customUnInit
  nsExec::ExecToLog 'taskkill /IM "OneClaw.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "OneClaw Helper.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "OneClaw-CLI.exe" /F'
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
