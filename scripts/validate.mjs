#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const requiredFiles = [
  "LICENSE",
  "README.md",
  "README.zh-CN.md",
  "SKILL.md",
  "agents/openai.yaml",
  "references/configuration.md",
  "references/cursor-behavior.md",
  "scripts/cursor-overlay.js",
  "scripts/install.mjs",
  "scripts/iframe-test.html",
  "scripts/smoke-test.html",
  "scripts/smoke-test.mjs",
];

for (const file of requiredFiles) {
  await access(path.join(root, file));
}

const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
if (!frontmatter) throw new Error("SKILL.md is missing YAML frontmatter");

const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
const description = frontmatter[1]
  .match(/^description:\s*(.+)$/m)?.[1]
  ?.trim();

if (name !== "agent-computer-browser-modes") {
  throw new Error(
    `Expected skill name agent-computer-browser-modes, got ${name ?? "none"}`,
  );
}
if (!description || description.length < 40 || /TODO/i.test(description)) {
  throw new Error("SKILL.md needs a complete discovery description");
}
if (/\bTODO\b/i.test(skill)) {
  throw new Error("SKILL.md still contains TODO placeholders");
}

console.log("Skill package validation passed.");
