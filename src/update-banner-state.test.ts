import test from "node:test";
import assert from "node:assert/strict";
import {
  reduceUpdateBannerState,
  createInitialUpdateBannerState,
  canStartUpdateDownload,
} from "./update-banner-state";

test("检测到更新后应显示红点，且允许点击开始下载", () => {
  const initial = createInitialUpdateBannerState();
  const next = reduceUpdateBannerState(initial, {
    type: "update-available",
    version: "2026.2.24",
  });

  assert.equal(next.status, "available");
  assert.equal(next.version, "2026.2.24");
  assert.equal(next.showBadge, true);
  assert.equal(canStartUpdateDownload(next), true);
});

test("点击更新后进入下载态并隐藏红点", () => {
  const available = reduceUpdateBannerState(createInitialUpdateBannerState(), {
    type: "update-available",
    version: "2026.2.24",
  });
  const downloading = reduceUpdateBannerState(available, {
    type: "download-started",
  });
  const progressed = reduceUpdateBannerState(downloading, {
    type: "download-progress",
    percent: 37.6,
  });

  assert.equal(progressed.status, "downloading");
  assert.equal(progressed.showBadge, false);
  assert.equal(progressed.percent, 37.6);
  assert.equal(canStartUpdateDownload(progressed), false);
});

test("下载失败后应回到可点击更新状态并恢复红点", () => {
  const downloading = reduceUpdateBannerState(
    reduceUpdateBannerState(createInitialUpdateBannerState(), {
      type: "update-available",
      version: "2026.2.24",
    }),
    { type: "download-started" },
  );

  const failed = reduceUpdateBannerState(downloading, {
    type: "download-failed",
  });

  assert.equal(failed.status, "available");
  assert.equal(failed.version, "2026.2.24");
  assert.equal(failed.showBadge, true);
  assert.equal(failed.percent, null);
});
