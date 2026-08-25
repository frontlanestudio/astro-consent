import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI_PATH = fileURLToPath(
  new URL("../dist/cli.cjs", import.meta.url)
);

let projectRoot: string;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-consent-cli-"));
  fs.writeFileSync(
    path.join(projectRoot, "astro.config.mjs"),
    `import { defineConfig } from "astro/config";\nexport default defineConfig({\n  integrations: [\n  ]\n});\n`,
    "utf8"
  );
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

function runCli(command: string) {
  return execFileSync("node", [CLI_PATH, command], {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

function writeLayout(relativePath: string, source: string) {
  const fullPath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, source, "utf8");
  return fullPath;
}

describe("astro-consent CLI", () => {
  it("wires the integration and stylesheet even without a BaseLayout.astro file", () => {
    writeLayout(
      "src/layouts/MainLayout.astro",
      `---\nimport "./something.css";\n---\n<html></html>\n`
    );

    runCli("init");

    const config = fs.readFileSync(
      path.join(projectRoot, "astro.config.mjs"),
      "utf8"
    );
    expect(config).toContain('import astroConsent from "astro-consent";');
    expect(config).toContain("astroConsent({");

    const cssFile = path.join(projectRoot, "src/cookiebanner/styles.css");
    expect(fs.existsSync(cssFile)).toBe(true);

    const layout = fs.readFileSync(
      path.join(projectRoot, "src/layouts/MainLayout.astro"),
      "utf8"
    );
    expect(layout).toContain(
      'import "../cookiebanner/styles.css"; // astro-consent:css'
    );
  });

  it("reports success from doctor once a non-standard layout imports the stylesheet", () => {
    writeLayout("src/layouts/MainLayout.astro", `---\n---\n<html></html>\n`);

    runCli("init");
    const output = runCli("doctor");

    expect(output).toContain("All required wiring is present.");
  });

  it("flags a missing stylesheet import in doctor for whichever layout files exist", () => {
    writeLayout("src/layouts/MainLayout.astro", `---\n---\n<html></html>\n`);

    runCli("init");
    // Revert only the layout import to simulate a project where init ran
    // before this layout existed, or the import was since removed.
    const layoutPath = path.join(projectRoot, "src/layouts/MainLayout.astro");
    fs.writeFileSync(layoutPath, `---\n---\n<html></html>\n`, "utf8");

    let output = "";
    try {
      runCli("doctor");
    } catch (err: any) {
      output = err.stdout ?? "";
    }

    expect(output).toContain("does not import the astro-consent stylesheet");
  });

  it("removes only the marker-tagged stylesheet import, leaving other imports intact", () => {
    writeLayout(
      "src/layouts/MainLayout.astro",
      `---\nimport "./something.css";\n---\n<html></html>\n`
    );

    runCli("init");
    runCli("remove");

    const layout = fs.readFileSync(
      path.join(projectRoot, "src/layouts/MainLayout.astro"),
      "utf8"
    );
    expect(layout).not.toContain("cookiebanner/styles.css");
    expect(layout).toContain('import "./something.css";');

    const cssFile = path.join(projectRoot, "src/cookiebanner/styles.css");
    expect(fs.existsSync(cssFile)).toBe(false);
  });
});
