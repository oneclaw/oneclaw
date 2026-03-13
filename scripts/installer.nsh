; OneClaw NSIS 自定义钩子
; 解决托盘常驻模式下 WM_CLOSE 被拦截、安装器报"无法关闭"的问题

!macro customInit
  ; 安装前强制终止正在运行的 OneClaw 进程树（/T 杀子进程，/F 强制）
  nsExec::ExecToLog 'taskkill /IM "OneClaw.exe" /T /F'
  ; 等待进程退出和文件句柄释放
  Sleep 1000
!macroend
