/**
 * 文件/目录路径识别与超链接化
 *
 * 在已 sanitize 的 HTML 中识别 Unix/macOS/Windows 文件路径，
 * 替换为可点击的 <a> 标签，点击后通过 Electron 打开本地文件。
 */

// 路径正则：匹配 Unix 绝对路径、~ 路径、Windows 盘符路径
// 要求路径至少包含一层目录分隔符，避免误匹配孤立的 "/" 或 "~"
const PATH_RE = new RegExp(
  [
    // Unix/macOS 绝对路径: /home/user/file.txt, /tmp/output/
    `(?:\\/(?:[\\w.@-]+\\/)+[\\w.@-]*)`,
    // Home 目录路径: ~/Documents/file.pdf
    `(?:~\\/(?:[\\w.@-]+\\/)*[\\w.@-]+)`,
    // Windows 路径: C:\Users\foo\bar.txt, D:\data\
    `(?:[A-Z]:\\\\(?:[\\w.@-]+\\\\)+[\\w.@-]*)`,
  ].join("|"),
  "g",
);

// 检查匹配位置是否在 HTML 标签属性内部（如 <a href="..."> 或 <img src="...">）
function isInsideHtmlTag(html: string, matchStart: number): boolean {
  // 从匹配位置向前搜索，找最近的 < 或 >
  for (let i = matchStart - 1; i >= 0; i--) {
    const ch = html[i];
    if (ch === ">") return false; // 遇到 > 说明在标签外
    if (ch === "<") return true;  // 遇到 < 说明在标签内
  }
  return false;
}

// 检查匹配位置是否已经被 <a> 标签包裹
function isInsideAnchor(html: string, matchStart: number): boolean {
  const before = html.slice(0, matchStart);
  const lastOpenA = before.lastIndexOf("<a ");
  if (lastOpenA === -1) return false;
  const lastCloseA = before.lastIndexOf("</a>");
  return lastOpenA > lastCloseA;
}

// 检查匹配前面是否紧跟协议前缀（http:// 等），说明这是 URL 的一部分
function isPrecededByProtocol(html: string, matchStart: number): boolean {
  // 向前最多检查 10 字符寻找 "://"
  const lookback = html.slice(Math.max(0, matchStart - 10), matchStart);
  return /\w+:\/\/$/.test(lookback);
}

/**
 * 在 sanitized HTML 中识别文件路径，替换为可点击超链接
 */
export function linkifyPaths(html: string): string {
  return html.replace(PATH_RE, (match, offset) => {
    // 跳过 HTML 标签属性内的路径
    if (isInsideHtmlTag(html, offset)) return match;
    // 跳过已在 <a> 标签内的路径
    if (isInsideAnchor(html, offset)) return match;
    // 跳过 URL 中的路径部分（如 http://example.com/path）
    if (isPrecededByProtocol(html, offset)) return match;

    const escaped = match
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return `<a class="chat-path-link" data-path="${escaped}" title="${escaped}">${match}</a>`;
  });
}
