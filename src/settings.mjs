/**
 * Safe merge of Pi's settings.json for the Windows PowerShell tool.
 * Never touches an explicit `defaultTools`, never overwrites malformed JSON,
 * preserves every unrelated key, and backs up before modifying.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";

export const WINDOWS_DEFAULT_TOOLS = ["read", "powershell", "edit", "write"];

export function expandHome(path, homedir = os.homedir()) {
  if (path === "~") return homedir;
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir, path.slice(2));
  return path;
}

/** Pi's agent directory: PI_CODING_AGENT_DIR when set, otherwise ~/.pi/agent. */
export function resolveAgentDir(env = process.env, homedir = os.homedir()) {
  const configured = env.PI_CODING_AGENT_DIR;
  if (typeof configured === "string" && configured.trim() !== "") {
    return resolve(expandHome(configured.trim(), homedir));
  }
  return join(homedir, ".pi", "agent");
}

export function backupFilePath(path, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${path}.bak-${stamp}`;
}

/** Write JSON atomically: temp file in the same directory, then rename over the target. */
export function writeJsonAtomic(path, value, { mode } = {}) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, mode ? { encoding: "utf8", mode } : "utf8");
  renameSync(tmp, path);
}

export function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) return { state: "absent", settings: {} };
  let text;
  try {
    text = readFileSync(settingsPath, "utf8");
  } catch (error) {
    return { state: "unreadable", error };
  }
  try {
    const parsed = JSON.parse(text.replace(/^﻿/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { state: "malformed" };
    return { state: "present", settings: parsed };
  } catch {
    return { state: "malformed" };
  }
}

/**
 * Ensure Pi's `defaultTools` enables the PowerShell tool on Windows.
 * Returns { changed, reason, settingsPath, backupPath?, message? }.
 */
export function applyWindowsDefaultTools({ agentDir, env = process.env, homedir } = {}) {
  const dir = agentDir ?? resolveAgentDir(env, homedir);
  const settingsPath = join(dir, "settings.json");
  const current = readSettings(settingsPath);

  if (current.state === "malformed" || current.state === "unreadable") {
    return {
      changed: false,
      reason: current.state,
      settingsPath,
      message: `${settingsPath} is not valid JSON, so it was left untouched. Fix or rename it, then add "defaultTools": ${JSON.stringify(WINDOWS_DEFAULT_TOOLS)} to enable the PowerShell tool.`,
    };
  }
  if (current.state === "present" && Object.hasOwn(current.settings, "defaultTools")) {
    return { changed: false, reason: "already-configured", settingsPath };
  }

  mkdirSync(dir, { recursive: true });
  let backupPath;
  if (current.state === "present") {
    backupPath = backupFilePath(settingsPath);
    copyFileSync(settingsPath, backupPath);
  }
  const next = { ...current.settings, defaultTools: [...WINDOWS_DEFAULT_TOOLS] };
  writeJsonAtomic(settingsPath, next);
  return { changed: true, reason: current.state === "present" ? "added" : "created", settingsPath, backupPath };
}

/** True when settings.json enables the powershell tool (or leaves Pi defaults, which exclude it). */
export function powershellToolEnabled({ agentDir, env = process.env, homedir } = {}) {
  const dir = agentDir ?? resolveAgentDir(env, homedir);
  const current = readSettings(join(dir, "settings.json"));
  if (current.state !== "present") return false;
  const tools = current.settings.defaultTools;
  return Array.isArray(tools) && tools.includes("powershell");
}
