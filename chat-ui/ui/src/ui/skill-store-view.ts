/**
 * 技能商店视图：搜索栏 + 排序栏 + 技能卡片列表 + 加载更多。
 */
import { html, nothing } from "lit";
import { t } from "./i18n.ts";
import { icons } from "./icons.ts";

export type SkillItem = {
  slug: string;
  name: string;
  description: string;
  version: string;
  downloads: number;
  highlighted: boolean;
  updatedAt: string;
};

export type SkillStoreState = {
  skills: SkillItem[];
  installedSlugs: Set<string>;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  sort: "updated" | "trending" | "downloads";
  nextCursor: string | null;
  installingSlugs: Set<string>;
};

export type SkillStoreCallbacks = {
  onSearch: (query: string) => void;
  onSortChange: (sort: "updated" | "trending" | "downloads") => void;
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
  onLoadMore: () => void;
  onBackToChat: () => void;
};

// 格式化下载数：>1000 显示 1.2k
function formatDownloads(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// 渲染排序按钮
function renderSortButton(
  label: string,
  value: string,
  current: string,
  onClick: () => void,
) {
  const active = value === current ? "active" : "";
  return html`
    <button
      class="skill-store__sort-btn ${active}"
      type="button"
      @click=${onClick}
    >${label}</button>
  `;
}

// 渲染单个技能卡片
function renderSkillCard(
  skill: SkillItem,
  installed: boolean,
  installing: boolean,
  onInstall: () => void,
  onUninstall: () => void,
) {
  return html`
    <div class="skill-store__card">
      <div class="skill-store__card-header">
        <div class="skill-store__card-icon">${icons.puzzle}</div>
        <div class="skill-store__card-info">
          <div class="skill-store__card-name">${skill.name}</div>
          <div class="skill-store__card-meta">
            v${skill.version}
            <span class="skill-store__card-downloads">${formatDownloads(skill.downloads)} ${t("skillStore.downloads")}</span>
          </div>
        </div>
        <div class="skill-store__card-action">
          ${installed
            ? html`
                <button
                  class="skill-store__btn skill-store__btn--installed"
                  type="button"
                  @click=${onUninstall}
                  ?disabled=${installing}
                >${t("skillStore.uninstall")}</button>
              `
            : html`
                <button
                  class="skill-store__btn skill-store__btn--install"
                  type="button"
                  @click=${onInstall}
                  ?disabled=${installing}
                >${installing ? t("skillStore.installing") : t("skillStore.install")}</button>
              `}
        </div>
      </div>
      <div class="skill-store__card-desc">${skill.description}</div>
    </div>
  `;
}

// 技能商店主视图
export function renderSkillStoreView(
  state: SkillStoreState,
  callbacks: SkillStoreCallbacks,
) {
  return html`
    <section class="skill-store">
      <div class="skill-store__header">
        <h2 class="skill-store__title">${t("skillStore.title")}</h2>
        <button
          class="skill-store__back"
          type="button"
          @click=${callbacks.onBackToChat}
        >${t("skillStore.backToChat")}</button>
      </div>

      <div class="skill-store__toolbar">
        <div class="skill-store__search">
          <input
            class="skill-store__search-input"
            type="text"
            placeholder=${t("skillStore.search")}
            .value=${state.searchQuery}
            @input=${(e: Event) => callbacks.onSearch((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="skill-store__sort">
          ${renderSortButton(t("skillStore.sortUpdated"), "updated", state.sort, () => callbacks.onSortChange("updated"))}
          ${renderSortButton(t("skillStore.sortTrending"), "trending", state.sort, () => callbacks.onSortChange("trending"))}
          ${renderSortButton(t("skillStore.sortDownloads"), "downloads", state.sort, () => callbacks.onSortChange("downloads"))}
        </div>
      </div>

      ${state.error
        ? html`<div class="skill-store__error">${state.error}</div>`
        : nothing}

      ${state.skills.length === 0 && !state.loading && !state.error
        ? html`<div class="skill-store__empty">${t("skillStore.empty")}</div>`
        : nothing}

      <div class="skill-store__list">
        ${state.skills.map((skill) =>
          renderSkillCard(
            skill,
            state.installedSlugs.has(skill.slug),
            state.installingSlugs.has(skill.slug),
            () => callbacks.onInstall(skill.slug),
            () => callbacks.onUninstall(skill.slug),
          ),
        )}
      </div>

      ${state.loading
        ? html`<div class="skill-store__loading">${t("chat.loading")}</div>`
        : nothing}

      ${!state.loading && state.nextCursor && state.skills.length > 0
        ? html`
            <div class="skill-store__load-more">
              <button
                class="skill-store__btn skill-store__btn--load-more"
                type="button"
                @click=${callbacks.onLoadMore}
              >${t("skillStore.loadMore")}</button>
            </div>
          `
        : nothing}
    </section>
  `;
}
