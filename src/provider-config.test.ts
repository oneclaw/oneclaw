import test from "node:test";
import assert from "node:assert/strict";
import {
  MIRRORED_FROM_FIELD,
  type ProviderMirrorState,
  isMirroredProviderEntry,
  mirrorAliasedProviders,
  syncPdfModelToPrimary,
} from "./provider-config";

function kimiProvider(model = "k2p5") {
  return {
    apiKey: "proxy-managed",
    baseUrl: "http://127.0.0.1:18790/coding",
    api: "anthropic-messages",
    models: [{ id: model, name: model, input: ["text", "image"], reasoning: true }],
  };
}

test("mirrorAliasedProviders creates schema-safe mirror entries", () => {
  const config: any = { models: { providers: { "kimi-coding": kimiProvider() } } };
  const state: ProviderMirrorState = { mirrors: {} };

  const result = mirrorAliasedProviders(config, { state });

  assert.equal(result.added, 1);
  assert.equal(result.cleanedLegacyMetadata, 0);
  assert.deepEqual(config.models.providers.kimi, config.models.providers["kimi-coding"]);
  assert.equal(MIRRORED_FROM_FIELD in config.models.providers.kimi, false);
  assert.equal(isMirroredProviderEntry(config.models.providers, "kimi", state), true);
  assert.equal(state.mirrors.kimi.source, "kimi-coding");
});

test("mirrorAliasedProviders cleans and updates legacy mirror metadata", () => {
  const config: any = {
    models: {
      providers: {
        "kimi-coding": kimiProvider("k2p6"),
        kimi: { ...kimiProvider("k2p5"), [MIRRORED_FROM_FIELD]: "kimi-coding" },
      },
    },
  };

  const state: ProviderMirrorState = { mirrors: {} };
  const result = mirrorAliasedProviders(config, { state });

  assert.equal(result.updated, 1);
  assert.equal(result.cleanedLegacyMetadata, 1);
  assert.deepEqual(config.models.providers.kimi, config.models.providers["kimi-coding"]);
  assert.equal(MIRRORED_FROM_FIELD in config.models.providers.kimi, false);
  assert.equal(state.mirrors.kimi.source, "kimi-coding");
});

test("isMirroredProviderEntry does not hide manual normalized providers", () => {
  const providers: any = {
    "kimi-coding": kimiProvider("k2p5"),
    kimi: {
      apiKey: "manual-key",
      baseUrl: "https://api.moonshot.cn/v1",
      api: "openai-completions",
      models: [{ id: "kimi-k2.5", name: "kimi-k2.5", input: ["text"] }],
    },
  };

  assert.equal(isMirroredProviderEntry(providers, "kimi"), false);
});

test("mirrorAliasedProviders refreshes tracked stale mirrors after source changes", () => {
  const config: any = { models: { providers: { "kimi-coding": kimiProvider("k2p5") } } };
  const state: ProviderMirrorState = { mirrors: {} };
  mirrorAliasedProviders(config, { state });

  config.models.providers["kimi-coding"].baseUrl = "http://127.0.0.1:19001/coding";
  config.models.providers["kimi-coding"].apiKey = "new-token";
  config.models.providers["kimi-coding"].models = kimiProvider("k2p6").models;
  const result = mirrorAliasedProviders(config, { state });

  assert.equal(result.updated, 1);
  assert.deepEqual(config.models.providers.kimi, config.models.providers["kimi-coding"]);
  assert.equal(config.models.providers.kimi.baseUrl, "http://127.0.0.1:19001/coding");
});

test("mirrorAliasedProviders removes tracked mirrors when source provider is deleted", () => {
  const config: any = { models: { providers: { "kimi-coding": kimiProvider("k2p5") } } };
  const state: ProviderMirrorState = { mirrors: {} };
  mirrorAliasedProviders(config, { state });
  delete config.models.providers["kimi-coding"];

  const result = mirrorAliasedProviders(config, { state });

  assert.equal(result.removed, 1);
  assert.equal(config.models.providers.kimi, undefined);
  assert.deepEqual(state.mirrors, {});
});

test("mirrorAliasedProviders merges missing models on normalized-provider collision", () => {
  const config: any = {
    models: {
      providers: {
        "kimi-coding": kimiProvider("kimi-for-coding"),
        kimi: {
          apiKey: "manual-key",
          baseUrl: "https://api.moonshot.cn/v1",
          api: "openai-completions",
          models: [{ id: "kimi-k2.5", name: "kimi-k2.5", input: ["text"] }],
        },
      },
    },
  };
  const state: ProviderMirrorState = { mirrors: {} };

  const result = mirrorAliasedProviders(config, { state });

  assert.equal(result.mergedCollisions, 1);
  assert.equal(config.models.providers.kimi.baseUrl, "https://api.moonshot.cn/v1");
  assert.deepEqual(
    config.models.providers.kimi.models.map((m: any) => m.id),
    ["kimi-k2.5", "kimi-for-coding"],
  );
  assert.equal(isMirroredProviderEntry(config.models.providers, "kimi", state), false);
});

test("syncPdfModelToPrimary sets missing pdfModel and preserves custom fallbacks", () => {
  const config: any = { agents: { defaults: { model: { primary: "kimi-coding/k2p5" } } } };
  assert.equal(syncPdfModelToPrimary(config), true);
  assert.deepEqual(config.agents.defaults.pdfModel, { primary: "kimi-coding/k2p5" });

  config.agents.defaults.model.primary = "kimi-coding/k2p6";
  config.agents.defaults.pdfModel = {
    primary: "anthropic/claude-sonnet-4-5-20250929",
    fallbacks: ["google/gemini-2.5-pro"],
  };
  assert.equal(syncPdfModelToPrimary(config, { previousPrimary: "kimi-coding/k2p5" }), false);
  assert.deepEqual(config.agents.defaults.pdfModel, {
    primary: "anthropic/claude-sonnet-4-5-20250929",
    fallbacks: ["google/gemini-2.5-pro"],
  });
});

test("syncPdfModelToPrimary updates only old generated shape when primary changes", () => {
  const config: any = {
    agents: {
      defaults: {
        model: { primary: "kimi-coding/k2p6" },
        pdfModel: { primary: "kimi-coding/k2p5" },
      },
    },
  };

  assert.equal(syncPdfModelToPrimary(config, { previousPrimary: "kimi-coding/k2p5" }), true);
  assert.deepEqual(config.agents.defaults.pdfModel, { primary: "kimi-coding/k2p6" });
});
