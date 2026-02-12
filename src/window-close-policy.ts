interface WindowClosePolicyInput {
  allowAppQuit: boolean;
}

// 关闭策略：仅在普通用户关闭时隐藏窗口，退出流程中放行关闭
export function shouldHideWindowOnClose(input: WindowClosePolicyInput): boolean {
  return !input.allowAppQuit;
}
