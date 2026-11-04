#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const START_MARKER = "# >>> codex-browser-modes managed config";
const END_MARKER = "# <<< codex-browser-modes managed config";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function usage() {
  console.log(`Usage: node scripts/install.mjs [options]

Options:
  --config <path>          Codex config file to update
  --skill-dir <path>       Installation directory for the skill
  --playwright-cli <path>  Explicit path to @playwright/mcp/cli.js
  --dry-run                Print the generated managed block only
  -h, --help               Show this help`);
}

function parseArgs(argv) {
  const options = {
    config: null,
    dryRun: false,
    help: false,
    playwrightCli: null,
    skillDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      options.config = argv[++index];
    } else if (arg === "--skill-dir") {
      options.skillDir = argv[++index];
    } else if (arg === "--playwright-cli") {
      options.playwrightCli = argv[++index];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolvePlaywrightCli(explicitPath, codexHome) {
  const candidates = [
    explicitPath,
    path.join(repoRoot, "node_modules", "@playwright", "mcp", "cli.js"),
    path.join(
      codexHome,
      "mcp",
      "playwright-mcp",
      "node_modules",
      "@playwright",
      "mcp",
      "cli.js",
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (await exists(resolved)) return resolved;
  }

  throw new Error(
    "Could not find @playwright/mcp/cli.js. Run npm install or pass --playwright-cli.",
  );
}

function tomlString(value) {
  return JSON.stringify(value);
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(", ")}]`;
}

function renderServer({
  args,
  env,
  name,
  nodeExecutable,
  toolApprovals,
}) {
  const lines = [
    `[mcp_servers.${name}]`,
    `command = ${tomlString(nodeExecutable)}`,
    `args = ${tomlArray(args)}`,
    "startup_timeout_sec = 60",
    'default_tools_approval_mode = "approve"',
    "",
    `[mcp_servers.${name}.env]`,
    ...Object.entries(env).map(
      ([key, value]) => `${key} = ${tomlString(value)}`,
    ),
  ];

  for (const [toolName, approvalMode] of Object.entries(toolApprovals)) {
    lines.push(
      "",
      `[mcp_servers.${name}.tools.${toolName}]`,
      `approval_mode = ${tomlString(approvalMode)}`,
    );
  }

  return lines.join("\n");
}

function buildManagedBlock({
  codexHome,
  nodeExecutable,
  playwrightCli,
  skillDir,
}) {
  const profileRoot = path.join(codexHome, "browser-profiles");
  const outputDir = path.join(codexHome, "browser-output");
  const localAppData = path.join(codexHome, "playwright-localappdata");
  const browsersPath = path.join(codexHome, "playwright-browsers");
  const registryPath = path.join(browsersPath, "registry");
  const overlayPath = path.join(skillDir, "scripts", "cursor-overlay.js");
  const env = {
    LOCALAPPDATA: localAppData,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    PWTEST_SERVER_REGISTRY: registryPath,
  };
  const commonArgs = [
    playwrightCli,
    "--browser",
    "msedge",
    "--output-dir",
    outputDir,
    "--image-responses",
    "omit",
  ];
  const sensitiveToolApprovals = {
    browser_drop: "prompt",
    browser_evaluate: "prompt",
    browser_file_upload: "prompt",
    browser_handle_dialog: "prompt",
    browser_run_code_unsafe: "prompt",
  };

  const background = renderServer({
    args: [
      ...commonArgs,
      "--user-data-dir",
      path.join(profileRoot, "msedge-background"),
      "--headless",
    ],
    env,
    name: "browser_background",
    nodeExecutable,
    toolApprovals: sensitiveToolApprovals,
  });

  const visible = renderServer({
    args: [
      ...commonArgs,
      "--user-data-dir",
      path.join(profileRoot, "msedge-visible"),
      "--caps",
      "vision",
      "--init-script",
      overlayPath,
    ],
    env,
    name: "browser_visible",
    nodeExecutable,
    toolApprovals: {
      ...sensitiveToolApprovals,
      browser_evaluate: "approve",
    },
  });

  return [
    START_MARKER,
    background,
    "",
    visible,
    END_MARKER,
    "",
  ].join("\n");
}

function stripManagedBlock(configText) {
  const startIndex = configText.indexOf(START_MARKER);
  if (startIndex === -1) return configText;

  const endIndex = configText.indexOf(END_MARKER, startIndex);
  if (endIndex === -1) {
    throw new Error("Found the start marker without the end marker");
  }

  return (
    configText.slice(0, startIndex) +
    configText.slice(endIndex + END_MARKER.length)
  ).replace(/\n{3,}/g, "\n\n");
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function copySkill(skillDir, codexHome) {
  const resolvedTarget = path.resolve(skillDir);
  const resolvedSource = path.resolve(repoRoot);
  const skillsRoot = path.join(codexHome, "skills");

  if (resolvedTarget === resolvedSource) return;
  if (!isInside(skillsRoot, resolvedTarget)) {
    throw new Error(
      `Skill directory must be inside ${skillsRoot}: ${resolvedTarget}`,
    );
  }
  if (path.dirname(resolvedTarget) === resolvedTarget) {
    throw new Error(`Refusing to replace filesystem root: ${resolvedTarget}`);
  }

  await mkdir(skillsRoot, { recursive: true });
  await rm(resolvedTarget, { recursive: true, force: true });
  await cp(resolvedSource, resolvedTarget, {
    filter(source) {
      const name = path.basename(source);
      return ![
        ".git",
        "browser-output",
        "node_modules",
        "test-output",
      ].includes(name);
    },
    recursive: true,
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const skillDir = path.resolve(
    options.skillDir || path.join(codexHome, "skills", "browser-modes"),
  );
  const configPath = path.resolve(
    options.config || path.join(codexHome, "config.toml"),
  );
  const playwrightCli = await resolvePlaywrightCli(
    options.playwrightCli,
    codexHome,
  );
  const block = buildManagedBlock({
    codexHome,
    nodeExecutable: process.execPath,
    playwrightCli,
    skillDir,
  }).replace(/\n/g, os.EOL);

  if (options.dryRun) {
    console.log(`# Skill: ${skillDir}`);
    console.log(`# Config: ${configPath}`);
    console.log(block);
    return;
  }

  await copySkill(skillDir, codexHome);
  await mkdir(path.dirname(configPath), { recursive: true });

  const original = (await exists(configPath))
    ? await readFile(configPath, "utf8")
    : "";

  if (original.length > 0) {
    const backupPath = `${configPath}.bak-${timestamp()}`;
    await copyFile(configPath, backupPath);
    console.log(`Backed up config: ${backupPath}`);
  }

  const base = stripManagedBlock(original).trimEnd();
  const next = `${base}${base ? os.EOL + os.EOL : ""}${block}`;
  await writeFile(configPath, next, "utf8");

  console.log(`Installed skill: ${skillDir}`);
  console.log(`Updated config: ${configPath}`);
  console.log("Restart Codex or open a new conversation to load the MCP servers.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
