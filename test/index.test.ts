import { describe, expect, it, vi } from "vitest";
import astroConsent from "../src/index.js";

function setupIntegration(options?: Parameters<typeof astroConsent>[0]) {
  const integration = astroConsent(options);
  const injectScript = vi.fn();
  const setup = integration.hooks?.["astro:config:setup"];
  if (!setup) throw new Error("astro:config:setup hook missing");
  // @ts-expect-error - only the fields the hook actually uses are provided
  setup({ injectScript });
  return injectScript;
}

describe("astroConsent", () => {
  it("registers under the expected integration name", () => {
    const integration = astroConsent();
    expect(integration.name).toBe("astro-consent");
  });

  it("exposes an astro:config:setup hook", () => {
    const integration = astroConsent();
    expect(integration.hooks).toHaveProperty("astro:config:setup");
  });

  it("injects two page scripts using defaults when no options are given", () => {
    const injectScript = setupIntegration();

    expect(injectScript).toHaveBeenCalledTimes(2);
    expect(injectScript).toHaveBeenNthCalledWith(1, "page", expect.any(String));
    expect(injectScript).toHaveBeenNthCalledWith(2, "page", expect.any(String));

    const [, firstScript] = injectScript.mock.calls[0];
    expect(firstScript).toContain('"astro-consent"');
    expect(firstScript).toContain("This website");

    const [, secondScript] = injectScript.mock.calls[1];
    expect(secondScript).toContain("Accept all");
    expect(secondScript).toContain("Reject all");
    expect(secondScript).toContain("Manage preferences");
    expect(secondScript).toContain("cb-mode-banner");
  });

  it("applies custom copy, presentation, and category overrides", () => {
    const injectScript = setupIntegration({
      siteName: "Acme Co",
      acceptLabel: "Allow all",
      rejectLabel: "Deny all",
      presentation: "overlay",
      categories: { marketing: false }
    });

    const [, runtimeScript] = injectScript.mock.calls[0];
    const [, uiScript] = injectScript.mock.calls[1];

    expect(runtimeScript).toContain("Acme Co");
    expect(uiScript).toContain("Allow all");
    expect(uiScript).toContain("Deny all");
    expect(uiScript).toContain("cb-mode-overlay");
    expect(runtimeScript).toMatch(/"marketing":false/);
  });

  it("falls back to policyUrl for both cookie and privacy policy links when unset", () => {
    const injectScript = setupIntegration({ policyUrl: "/legal" });
    const [, runtimeScript] = injectScript.mock.calls[0];

    const cookiePolicyMatches = runtimeScript.match(/COOKIE_POLICY_URL = "\/legal"/);
    const privacyPolicyMatches = runtimeScript.match(/PRIVACY_POLICY_URL = "\/legal"/);
    expect(cookiePolicyMatches).not.toBeNull();
    expect(privacyPolicyMatches).not.toBeNull();
  });

  it("prefers explicit cookiePolicyUrl/privacyPolicyUrl over policyUrl", () => {
    const injectScript = setupIntegration({
      policyUrl: "/legal",
      cookiePolicyUrl: "/cookies",
      privacyPolicyUrl: "/privacy-details"
    });
    const [, runtimeScript] = injectScript.mock.calls[0];

    expect(runtimeScript).toContain('COOKIE_POLICY_URL = "/cookies"');
    expect(runtimeScript).toContain('PRIVACY_POLICY_URL = "/privacy-details"');
  });

  it("converts consent.days into a millisecond TTL", () => {
    const injectScript = setupIntegration({ consent: { days: 7 } });
    const [, runtimeScript] = injectScript.mock.calls[0];

    expect(runtimeScript).toContain(`const TTL = ${7 * 24 * 60 * 60 * 1000};`);
  });
});
