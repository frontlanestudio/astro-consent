#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { DEFAULT_CSS } from "./templates/cssTemplate.js";

const CWD = process.cwd();
const args = process.argv.slice(2);
const command = args[0] ?? "init";
const flags = new Set(args.slice(1));
const isDryRun = flags.has("--dry-run");
const isJson = flags.has("--json");

const ASTRO_CONFIG_FILES = [
  "astro.config.mjs",
  "astro.config.ts",
  "astro.config.js"
];

function findAstroConfig(): string | null {
  for (const file of ASTRO_CONFIG_FILES) {
    const fullPath = path.join(CWD, file);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

function walkAstroFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkAstroFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".astro")) {
      found.push(fullPath);
    }
  }
  return found;
}

/**
 * Layout file name isn't standardized across Astro projects (BaseLayout,
 * MainLayout, Layout, etc.), so every .astro file under src/layouts is
 * treated as a candidate rather than assuming a single fixed name.
 */
function findLayoutFiles(): string[] {
  return walkAstroFiles(path.join(CWD, "src", "layouts"));
}

function layoutImportsCss(source: string): boolean {
  return /cookiebanner\/styles\.css/.test(source);
}

function relativeCssImportPath(layoutFile: string, cssFile: string): string {
  const rel = path
    .relative(path.dirname(layoutFile), cssFile)
    .split(path.sep)
    .join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function insertCssImport(layoutSource: string, importPath: string): string {
  const importLine = `import "${importPath}"; // astro-consent:css`;
  const frontmatterOpen = layoutSource.match(/^---\r?\n/);
  if (frontmatterOpen) {
    const insertAt = frontmatterOpen[0].length;
    return (
      layoutSource.slice(0, insertAt) +
      importLine +
      "\n" +
      layoutSource.slice(insertAt)
    );
  }
  return `---\n${importLine}\n---\n${layoutSource}`;
}

function removeCssImport(layoutSource: string): string {
  return layoutSource.replace(
    /^import\s+["'][^"']*cookiebanner\/styles\.css["'];?\s*\/\/ astro-consent:css\r?\n/m,
    ""
  );
}

function exitWith(message: string, code = 1): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(code);
}

function printHelp(): never {
  console.log(`
astro-consent

Usage:
  npx astro-consent init
  npx astro-consent remove
  npx astro-consent doctor
  npx astro-consent status

Backwards compatible alias:
  npx astro-consent

Flags:
  --dry-run   Show what would change without writing files
  --json      Output machine-readable doctor/status data
`);
  process.exit(0);
}

function readConfig() {
  const configPath = findAstroConfig();
  if (!configPath) {
    exitWith(
      "No astro.config.(mjs|ts|js) found. Run this in the root of an Astro project."
    );
  }
  return {
    configPath,
    source: fs.readFileSync(configPath, "utf8")
  };
}

function ensureCssFile(dryRun = false): string {
  const cssDir = path.join(CWD, "src", "cookiebanner");
  const cssFile = path.join(cssDir, "styles.css");

  if (!fs.existsSync(cssDir)) {
    if (!dryRun) fs.mkdirSync(cssDir, { recursive: true });
  }

  if (!fs.existsSync(cssFile)) {
    if (!dryRun) {
      fs.writeFileSync(cssFile, DEFAULT_CSS.trimStart(), "utf8");
      console.log("🎨 Created src/cookiebanner/styles.css");
    }
  }

  return cssFile;
}

function buildIntegrationBlock(): string {
  return `    // astro-consent:start
    astroConsent({
      siteName: "My Website",
      headline: "Manage cookie preferences for My Website",
      description: "We use cookies to improve site performance, measure traffic, and support marketing.",
      acceptLabel: "Accept all",
      rejectLabel: "Reject all",
      manageLabel: "Manage preferences",
      cookiePolicyUrl: "/cookie-policy",
      privacyPolicyUrl: "/privacy",
      displayUntilIdle: true,
      displayIdleDelayMs: 1000,
      consent: {
        days: 30,
        storageKey: "astro-consent"
      }
    }),
    // astro-consent:end
`;
}

function removeIntegrationBlock(source: string): string {
  return source.replace(
    /\n\s*\/\/ astro-consent:start[\s\S]*?\/\/ astro-consent:end\s*,?/m,
    "\n"
  );
}

/* ─────────────────────────────────────
   Locate astro.config
   
───────────────────────────────────── */

if (command === "--help" || command === "-h" || command === "help") {
  printHelp();
}

/* ─────────────────────────────────────
   REMOVE MODE
───────────────────────────────────── */

if (command === "remove") {
  const { configPath, source: original } = readConfig();
  let source = removeIntegrationBlock(original);
  source = source.replace(
    /import\s+astroConsent\s+from\s+["']astro-consent["'];?\n?/,
    ""
  );

  if (!isDryRun) {
    fs.writeFileSync(configPath, source.trim() + "\n", "utf8");
  }

  const cssFile = path.join(CWD, "src", "cookiebanner", "styles.css");
  if (!isDryRun && fs.existsSync(cssFile)) fs.unlinkSync(cssFile);

  for (const layoutFile of findLayoutFiles()) {
    const layoutSource = fs.readFileSync(layoutFile, "utf8");
    const stripped = removeCssImport(layoutSource);
    if (stripped !== layoutSource && !isDryRun) {
      fs.writeFileSync(layoutFile, stripped, "utf8");
    }
  }

  console.log(isDryRun ? "\n🧪 Dry run: astro-consent would be removed\n" : "\n🧹 astro-consent fully removed\n");
  process.exit(0);
}

if (command === "doctor") {
  const { configPath, source } = readConfig();
  const cssFile = path.join(CWD, "src", "cookiebanner", "styles.css");
  const findings: Array<{ issue: string; fix: string }> = [];
  const checks: Array<{ label: string; ok: boolean; detail: string }> = [];

  const hasImport =
    source.includes(`from "astro-consent"`) ||
    source.includes(`from 'astro-consent'`);
  checks.push({
    label: "Config import",
    ok: hasImport,
    detail: hasImport
      ? "astro.config includes astro-consent import"
      : "astro.config is missing the astro-consent import"
  });

  if (!hasImport) {
    findings.push({
      issue: "astro.config.* does not import astro-consent",
      fix: "Run `npx astro-consent init` or add `import astroConsent from \"astro-consent\";` manually."
    });
  }

  const hasIntegration = source.includes("astroConsent(");
  checks.push({
    label: "Integration",
    ok: hasIntegration,
    detail: hasIntegration
      ? "astroConsent(...) is present in integrations"
      : "astroConsent(...) is missing from integrations"
  });

  if (!hasIntegration) {
    findings.push({
      issue: "astro.config.* does not include astroConsent(...) in integrations",
      fix: "Add `astroConsent(...)` inside the `integrations` array."
    });
  }

  const hasCss = fs.existsSync(cssFile);
  checks.push({
    label: "Stylesheet",
    ok: hasCss,
    detail: hasCss
      ? "src/cookiebanner/styles.css exists"
      : "src/cookiebanner/styles.css is missing"
  });

  if (!hasCss) {
    findings.push({
      issue: "src/cookiebanner/styles.css is missing",
      fix: "Run `npx astro-consent init` to recreate the stylesheet."
    });
  }

  const layoutFiles = findLayoutFiles();
  if (layoutFiles.length === 0) {
    checks.push({
      label: "Layout import",
      ok: false,
      detail: "No .astro files found under src/layouts"
    });
    findings.push({
      issue: "No layout files found under src/layouts",
      fix: "Create a shared layout (e.g. src/layouts/MainLayout.astro) that imports \"../cookiebanner/styles.css\", or add the import to whatever component wraps every page."
    });
  } else {
    const missingImport = layoutFiles.filter(
      file => !layoutImportsCss(fs.readFileSync(file, "utf8"))
    );
    const hasLayoutImport = missingImport.length === 0;
    checks.push({
      label: "Layout import",
      ok: hasLayoutImport,
      detail: hasLayoutImport
        ? `${layoutFiles.length} layout file(s) import the astro-consent stylesheet`
        : `${missingImport.length} of ${layoutFiles.length} layout file(s) are missing the stylesheet import`
    });

    for (const file of missingImport) {
      const relPath = path.relative(CWD, file);
      findings.push({
        issue: `${relPath} does not import the astro-consent stylesheet`,
        fix: `Add \`import "${relativeCssImportPath(file, cssFile)}";\` near the top of ${relPath}, or run \`npx astro-consent init\` to wire it automatically. Without this, the banner still renders but with no styling.`
      });
    }
  }

  const summary = {
    ok: findings.length === 0,
    checks,
    findings
  };

  if (isJson) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  }

  console.log("\nastro-consent doctor");
  for (const check of checks) {
    console.log(`${check.ok ? "✅" : "❌"} ${check.label}: ${check.detail}`);
  }

  if (findings.length === 0) {
    console.log("\nAll required wiring is present.\n");
    process.exit(0);
  }

  console.log("\nNext fixes:");
  for (const finding of findings) {
    console.log(`- ${finding.issue}`);
    console.log(`  Fix: ${finding.fix}`);
  }
  console.log("");
  process.exit(1);
}

if (command === "status") {
  const { source } = readConfig();
  const cssFile = path.join(CWD, "src", "cookiebanner", "styles.css");
  const layoutFiles = findLayoutFiles();
  const cssWiredInLayout = layoutFiles.some(file =>
    layoutImportsCss(fs.readFileSync(file, "utf8"))
  );
  const linked = fs.existsSync(path.join(CWD, "node_modules", "astro-consent"));
  const consentKeyMatch = source.match(/storageKey:\s*["']([^"']+)["']/);
  const consentKey = consentKeyMatch?.[1] ?? "astro-consent";
  const report = {
    configWired:
      source.includes(`from "astro-consent"`) &&
      source.includes("astroConsent("),
    cssExists: fs.existsSync(cssFile),
    cssWiredInLayout,
    linkedInstall: linked,
    consentStorageKey: consentKey,
    consentStored: "browser-only; inspect via window.astroConsent.get()"
  };

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  console.log("\nastro-consent status");
  console.log(`${report.configWired ? "✅" : "❌"} Config wiring`);
  console.log(`${report.cssExists ? "✅" : "❌"} CSS file exists`);
  console.log(`${report.cssWiredInLayout ? "✅" : "❌"} CSS imported in a layout`);
  console.log(`${report.linkedInstall ? "✅" : "❌"} Linked install present`);
  console.log(`ℹ️  Consent storage key: ${report.consentStorageKey}`);
  console.log(`ℹ️  Consent state: ${report.consentStored}`);
  console.log(`ℹ️  Check in browser: window.astroConsent.get()`);
  console.log("");
  process.exit(0);
}

if (command !== "init" && command !== "install") {
  printHelp();
}

/* ─────────────────────────────────────
   Inject Astro integration
───────────────────────────────────── */

const { configPath, source: original } = readConfig();
let source = original;

const cssFile = ensureCssFile(isDryRun);

if (!source.includes(`from "astro-consent"`)) {
  source = `import astroConsent from "astro-consent";\n${source}`;
}

if (!source.includes("astro-consent:start")) {
  source = source.replace(
    /integrations\s*:\s*\[/,
    match => `${match}\n${buildIntegrationBlock()}`
  );
}

if (!isDryRun) {
  fs.writeFileSync(configPath, source, "utf8");
}

const layoutFiles = findLayoutFiles();
if (layoutFiles.length === 0) {
  console.log(
    "⚠️  No layout files found under src/layouts — add `import \"../cookiebanner/styles.css\";` to whatever component wraps every page, or the banner will render unstyled."
  );
} else {
  for (const layoutFile of layoutFiles) {
    const layoutSource = fs.readFileSync(layoutFile, "utf8");
    if (layoutImportsCss(layoutSource)) continue;

    const importPath = relativeCssImportPath(layoutFile, cssFile);
    const relLayoutPath = path.relative(CWD, layoutFile);

    if (!isDryRun) {
      fs.writeFileSync(
        layoutFile,
        insertCssImport(layoutSource, importPath),
        "utf8"
      );
    }

    console.log(
      isDryRun
        ? `🧪 Dry run: would add stylesheet import to ${relLayoutPath}`
        : `🎨 Added stylesheet import to ${relLayoutPath}`
    );
  }
}

console.log(
  isDryRun
    ? "\n🧪 Dry run: astro-consent would be installed successfully"
    : "\n🎉 astro-consent installed successfully"
);
console.log("👉 Edit src/cookiebanner/styles.css to theme the banner and modal.");
console.log("👉 Run `astro-consent remove` to uninstall\n");
