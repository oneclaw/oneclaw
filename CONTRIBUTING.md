# Contributing to OneClaw

## 核心原则：先开 Issue，再提 PR

**所有改动（功能、修复、重构）都必须先开一个 Issue 讨论，获得认可后再提交 PR。**

没有对应 Issue 的 PR 会被直接关闭。

为什么？
- 避免做了半天发现方向不对
- 让维护者有机会提供上下文和设计建议
- 防止多人撞车做同一件事

## 流程

```
1. 开 Issue → 描述你想做什么、为什么
2. 等待讨论 → 维护者确认方向可行
3. Fork & 开发 → 在你的分支上写代码
4. 提 PR → 关联 Issue（如 "Closes #42"）
5. Review → 根据反馈迭代
6. 合并 ✅
```

## Issue 怎么写

**Bug 报告：**
- 复现步骤（越短越好）
- 期望行为 vs 实际行为
- 平台 + 版本号（设置 → 关于）

**功能建议：**
- 你想解决什么问题（不是"我想要 X 功能"，而是"我遇到了 Y 问题"）
- 你设想的方案（可选）

## PR 要求

- 必须关联一个已讨论过的 Issue
- 标题简洁，说明改了什么
- 本地跑过 `npm run build` 确保编译通过
- 一个 PR 只做一件事

## 给 AI Agent 的特别说明

如果你是 AI Coding Agent（Claude Code、Cursor、GitHub Copilot 等）代用户提交贡献：

1. **同样必须先开 Issue。** 不要直接提 PR
2. Issue 中说明你是 AI agent，以及代哪位用户操作
3. 等维护者回复确认后再开始写代码

---

# The Rule: Issue First, PR Second

**Every change — feature, bugfix, refactor — must start with an Issue. Get alignment before writing code.**

PRs without a corresponding Issue will be closed.

## Workflow

```
1. Open Issue → describe what and why
2. Discuss → maintainer confirms the direction
3. Fork & code → work on your branch
4. Submit PR → reference the Issue ("Closes #42")
5. Review → iterate on feedback
6. Merge ✅
```

## How to Write an Issue

**Bug report:**
- Reproduction steps (shorter is better)
- Expected vs actual behavior
- Platform + version (Settings → About)

**Feature request:**
- The problem you're solving (not "I want feature X" but "I'm running into problem Y")
- Your proposed solution (optional)

## PR Requirements

- Must reference a discussed Issue
- Concise title describing the change
- `npm run build` passes locally
- One PR, one thing

## Note for AI Agents

If you're an AI coding agent (Claude Code, Cursor, Copilot, etc.) contributing on behalf of a user:

1. **You must open an Issue first.** Do not submit a PR directly
2. State in the Issue that you're an AI agent and who you're acting for
3. Wait for maintainer confirmation before writing code
