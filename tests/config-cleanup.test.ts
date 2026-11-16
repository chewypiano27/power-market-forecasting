import { expect, test } from "bun:test";
import { createDefaultConfig, CURRENT_CONFIG_VERSION } from "../src/types/config";
import { normalizeConfigForSave, normalizeLoadedConfig } from "../src/data/config/store/normalize";

const dataDir = "/tmp/vic1-config-test";

test("saved workspaces retain their layout, language and preferences through a load/save cycle", () => {
  const original = {
    ...createDefaultConfig(dataDir),
    language: "es" as const,
    theme: "white",
    fontSize: 16,
    commandBarOpens: 7,
  };
  const loaded = normalizeLoadedConfig(original, dataDir).config;
  const saved = normalizeConfigForSave(loaded);

  expect(saved.configVersion).toBe(CURRENT_CONFIG_VERSION);
  expect(saved.layout).toEqual(original.layout);
  expect(saved.layouts[0]?.paneState).toEqual(original.layouts[0]?.paneState);
  expect(saved.language).toBe("es");
  expect(saved.fontSize).toBe(16);
  expect(saved.commandBarOpens).toBe(7);
  expect(normalizeLoadedConfig(saved, dataDir).config).toEqual(loaded);
});

test("retired prompt and reporting settings cannot reappear after loading an existing config", () => {
  const original = {
    ...createDefaultConfig(dataDir),
    starPrompt: { shownAt: "2026-11-15", outcome: "opened" },
    telemetry: { crashReports: true },
    updates: { channel: "nightly" },
  };
  const saved = normalizeConfigForSave(normalizeLoadedConfig(original, dataDir).config);

  expect(saved.layout).toEqual(original.layout);
  for (const key of ["starPrompt", "telemetry", "updates"]) {
    expect(Object.hasOwn(saved, key)).toBe(false);
  }
});

test("malformed saved values recover to a usable default workspace", () => {
  const loaded = normalizeLoadedConfig({
    configVersion: CURRENT_CONFIG_VERSION,
    layout: null,
    layouts: "bad",
    activeLayoutIndex: 999,
    language: "invalid",
    pluginConfig: "bad",
  }, dataDir);

  expect(loaded.needsSave).toBe(true);
  expect(loaded.config.layout.instances.length).toBeGreaterThan(0);
  expect(loaded.config.language).toBeUndefined();
  expect(loaded.config.activeLayoutIndex).toBe(0);
});
