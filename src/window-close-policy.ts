interface WindowClosePolicyInput {
  allowAppQuit: boolean;
  setupPending?: boolean;
}

// 关闭策略：Setup 未完成时关闭 = 退出应用；普通场景隐藏到托盘；退出流程中放行关闭
export function shouldHideWindowOnClose(input: WindowClosePolicyInput): boolean {
  if (input.allowAppQuit) return false;
  if (input.setupPending) return false;
  return true;
}
