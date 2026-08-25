import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { loadUserConfig, mergeUserConfig } from "../src/config/loadConfig.js";

describe("mergeUserConfig", () => {
  it("returns the defaults untouched when no user config is given", () => {
    expect(mergeUserConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it("merges top-level and nested consent overrides on top of defaults", () => {
    const config = mergeUserConfig({
      siteName: "Custom Site",
      consent: { days: 14 }
    });

    expect(config.siteName).toBe("Custom Site");
    expect(config.consent.days).toBe(14);
    expect(config.consent.enabled).toBe(DEFAULT_CONFIG.consent.enabled);
    expect(config.consent.storageKey).toBe(DEFAULT_CONFIG.consent.storageKey);
    expect(config.categories.essential).toEqual(DEFAULT_CONFIG.categories.essential);
  });

  it("merges per-category overrides without dropping default fields", () => {
    const config = mergeUserConfig({
      categories: { analytics: { enabled: true, label: "Analytics" } }
    });

    expect(config.categories.analytics.enabled).toBe(true);
    expect(config.categories.analytics.label).toBe("Analytics");
  });

  it("adds custom user-defined categories not present in defaults", () => {
    const config = mergeUserConfig({
      categories: { preferences: { label: "Preferences", enabled: true } }
    });

    expect(config.categories.preferences).toEqual({
      label: "Preferences",
      enabled: true
    });
    expect(config.categories.essential).toEqual(DEFAULT_CONFIG.categories.essential);
  });

  it("defaults a custom category's enabled flag to false when omitted", () => {
    const config = mergeUserConfig({
      categories: { social: { label: "Social" } }
    });

    expect(config.categories.social.enabled).toBe(false);
  });
});

describe("loadUserConfig", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-consent-"));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("falls back to defaults when no config file exists", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = await loadUserConfig(projectRoot);

    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnSpy).toHaveBeenCalledWith(
      "[astro-consent] Failed to load user config, falling back to defaults"
    );
  });
});
