import "./styles.css";
import { t } from "./ui/i18n";
import "./ui/app.ts";

// 渲染进程启动时同步页面标题，避免文档标题与原生窗口标题不一致。
document.title = t("app.windowTitle");
