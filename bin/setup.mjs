#!/usr/bin/env node
/**
 * CUNY AI Lab × Pi workshop installer.
 *
 *   npx @cuny-ai-lab/cail-pi            (macOS / Linux)
 *   npx.cmd @cuny-ai-lab/cail-pi        (Windows PowerShell)
 *
 * Wires real platform services into the orchestrator in ../src/setup.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HELP_TEXT, parseArgs } from "../src/args.mjs";
import { checkApiKey, fetchModelCatalog } from "../src/cail-api.mjs";
import { deleteApiKey, readCredentialStatus, readStoredApiKey, resolveAuthPath, saveApiKey } from "../src/credentials.mjs";
import { runDoctor } from "../src/diagnostics.mjs";
import { createPi } from "../src/pi.mjs";
import { captureCommand } from "../src/platform.mjs";
import { createPrompts, loadInquirer } from "../src/prompts.mjs";
import { applyWindowsDefaultTools, powershellToolEnabled, resolveAgentDir } from "../src/settings.mjs";
import { runSetup, runUninstall } from "../src/setup.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function npmVersion() {
  const result = captureCommand("npm", ["--version"]);
  if (result.error || result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

async function buildDeps() {
  const agentDir = resolveAgentDir();
  const authPath = resolveAuthPath({ agentDir });
  const inquirer = await loadInquirer();
  return {
    platform: process.platform,
    release: os.release(),
    nodeVersion: process.version,
    execPath: process.execPath,
    env: process.env,
    homedir: os.homedir(),
    version: packageJson.version,
    out: (line = "") => process.stdout.write(`${line}\n`),
    err: (line = "") => process.stderr.write(`${line}\n`),
    npmVersion,
    pi: createPi(),
    prompts: createPrompts(inquirer),
    checkApiKey: (key) => checkApiKey(key),
    fetchModelCatalog: () => fetchModelCatalog(),
    credentials: {
      authPath,
      status: () => readCredentialStatus(authPath),
      storedKey: () => readStoredApiKey(authPath),
      save: (key) => saveApiKey(key, { authPath }),
      remove: () => deleteApiKey({ authPath }),
    },
    settings: {
      applyWindows: () => applyWindowsDefaultTools({ agentDir }),
      powershellEnabled: () => powershellToolEnabled({ agentDir }),
    },
    agentDir,
    legacyExtensionPresent: () => existsSync(join(agentDir, "extensions", "cail.ts")),
  };
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.errors.length > 0) {
    for (const error of options.errors) process.stderr.write(`${error}\n`);
    process.stderr.write(`\n${HELP_TEXT}`);
    return 2;
  }
  if (options.command === "help") {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (options.command === "version") {
    process.stdout.write(`${packageJson.version}\n`);
    return 0;
  }
  const deps = await buildDeps();
  if (options.command === "doctor") return (await runDoctor(deps)).exitCode;
  if (options.command === "uninstall") return (await runUninstall(deps)).exitCode;
  return (await runSetup(options, deps)).exitCode;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly || process.argv[1]?.endsWith("cail-pi")) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      // Prompt cancellation (Ctrl+C) is not an error worth a stack trace.
      if (error?.name === "ExitPromptError") {
        process.stderr.write("\nSetup cancelled. Nothing was saved.\n");
        process.exitCode = 130;
        return;
      }
      process.stderr.write(`\nSetup failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
