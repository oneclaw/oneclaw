export type ShareCopyLocale = "zh" | "en";

type ShareCopyLocaleContent = {
  title: string;
  subtitle: string;
  body: string;
};

export type ShareCopyPayload = {
  version: number;
  locales: Record<ShareCopyLocale, ShareCopyLocaleContent>;
};

export const SHARE_COPY_PAYLOAD: ShareCopyPayload = {
  version: 202602195,
  locales: {
    zh: {
      title: "分享 OneClaw 给朋友",
      subtitle: "复制下面这段文案分享给你的朋友或群聊，作者会非常感谢你哟😘",
      body: [
        "最近发现一个 OpenClaw 的一键安装包叫做 OneClaw",
        "几分钟就能装好并开始用",
        "",
        "他们说 OpenClaw 可以做这些事：",
        "• 浏览器操作：自动搜索浏览、定时信息抓取、处理汇总",
        "• 内容创作：文案写作、生成 AI 图片",
        "• 数据处理：处理 Excel 数据、制作图表",
        "• 办公自动化：批量处理邮件、简历筛选、填写表单",
        "• 会议助手：会前整理文件制作 PPT、会后快速生成纪要",
        "",
        "低成本把内容、运营、办公、招聘自动化，可以下载试试：oneclaw.cn",
      ].join("\n"),
    },
    en: {
      title: "Share OneClaw with friends",
      subtitle:
        "Copy this text and share it with your friends or group chats. The creator will really appreciate it 😘",
      body: [
        "I recently found a one-click installer for OpenClaw called OneClaw",
        "You can get it installed and start using it in just a few minutes",
        "",
        "People say OpenClaw can do these things:",
        "• Browser automation: auto search and browsing, scheduled information capture, and summary processing",
        "• Content creation: copywriting and AI image generation",
        "• Data processing: Excel data handling and chart creation",
        "• Office automation: batch email processing, resume screening, and form filling",
        "• Meeting assistant: pre-meeting file prep and PPT creation, plus fast post-meeting minutes",
        "",
        "If you want low-cost automation for content, operations, office work, and recruiting, try: oneclaw.cn",
      ].join("\n"),
    },
  },
};
