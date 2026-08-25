import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import type { CookieBannerConfig, CookieCategory } from "../types/config.js";
import { DEFAULT_CONFIG } from "./defaults.js";

/**
 * Shape of a user-authored config file. Every field, including nested
 * ones, is optional since the user may only want to override a subset.
 */
export interface UserConfigInput {
  siteName?: string;
  policyUrl?: string;
  consent?: Partial<CookieBannerConfig["consent"]>;
  categories?: Record<string, Partial<CookieCategory>>;
}

/**
 * Safely loads the user config file and merges it with defaults.
 * User values always override defaults.
 * Cache-busted to ensure updates are picked up during dev.
 */
export async function loadUserConfig(
  projectRoot: string
): Promise<CookieBannerConfig> {
  const configPath = path.join(
    projectRoot,
    "src",
    "astro-consent",
    "config.ts"
  );

  let userConfig: UserConfigInput = {};

  try {
    const stat = fs.statSync(configPath);
    const cacheBuster = `?v=${stat.mtimeMs}`;

    const imported = await import(
      /* @vite-ignore */
      pathToFileURL(configPath).href + cacheBuster
    );

    userConfig = imported?.default ?? {};
  } catch (err) {
    console.warn(
      "[astro-consent] Failed to load user config, falling back to defaults"
    );
  }

  return mergeUserConfig(userConfig, DEFAULT_CONFIG);
}

/**
 * Merge a partial user config with defaults.
 * Pulled out of loadUserConfig so the merge behavior can be
 * unit-tested without exercising the dynamic file import.
 */
export function mergeUserConfig(
  userConfig: UserConfigInput,
  defaults: CookieBannerConfig = DEFAULT_CONFIG
): CookieBannerConfig {
  return {
    siteName: userConfig.siteName ?? defaults.siteName,

    policyUrl: userConfig.policyUrl ?? defaults.policyUrl,

    consent: {
      enabled:
        userConfig.consent?.enabled ??
        defaults.consent.enabled,

      days:
        userConfig.consent?.days ??
        defaults.consent.days,

      storageKey:
        userConfig.consent?.storageKey ??
        defaults.consent.storageKey
    },

    categories: mergeCategories(
      userConfig.categories,
      defaults.categories
    )
  };
}

/**
 * Merge category config safely.
 * - Defaults are preserved
 * - User overrides win
 * - Custom categories are supported
 */
function mergeCategories(
  userCategories: Record<string, Partial<CookieCategory>> | undefined,
  defaultCategories: CookieBannerConfig["categories"]
): CookieBannerConfig["categories"] {
  const merged: CookieBannerConfig["categories"] = {};

  // Start with defaults
  for (const key of Object.keys(defaultCategories)) {
    merged[key] = {
      ...defaultCategories[key],
      ...(userCategories?.[key] ?? {})
    };
  }

  // Add user-defined custom categories safely
  if (userCategories) {
    for (const key of Object.keys(userCategories)) {
      if (!merged[key]) {
        merged[key] = {
          label: userCategories[key].label ?? key,
          ...userCategories[key],
          enabled: userCategories[key].enabled ?? false
        };
      }
    }
  }

  return merged;
}