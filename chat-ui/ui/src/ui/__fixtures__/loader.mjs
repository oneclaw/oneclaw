// Node ESM resolver hook：把 .js → .ts 反向解析，让 chat-ui 内的 ".js" import（实际指向 .ts 源文件，靠 Vite 解析）
// 在 node --experimental-strip-types 下也能跑通。仅供 controllers/chat.test.ts 等本地 node:test 用。
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".js") && (specifier.startsWith("./") || specifier.startsWith("../"))) {
    try {
      const resolved = await nextResolve(specifier, context);
      const path = fileURLToPath(resolved.url);
      if (!existsSync(path)) {
        const tsCandidate = specifier.replace(/\.js$/, ".ts");
        return nextResolve(tsCandidate, context);
      }
      return resolved;
    } catch {
      const tsCandidate = specifier.replace(/\.js$/, ".ts");
      return nextResolve(tsCandidate, context);
    }
  }
  return nextResolve(specifier, context);
}
