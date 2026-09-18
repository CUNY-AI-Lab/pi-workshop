/**
 * Platform helpers: executable names, spawn plans, and human-readable labels.
 *
 * All process launches go through `buildSpawnPlan` / `runCommand` so that:
 *  - Windows uses the npm-generated `.cmd` shims (npm.cmd, npx.cmd, pi.cmd)
 *  - callers always pass arguments as arrays; only this module builds a command line
 *
 * Windows note: Node.js (since the CVE-2024-27980 fix) refuses to spawn a
 * `.cmd`/`.bat` file without `shell: true`. That is the one place a shell is
 * demonstrably necessary, so on win32 the plan sets `shell: true` and quotes
 * every argument itself. No user-provided secret is ever passed as an argument.
 *
 * The quoted arguments are joined into the command string rather than handed
 * to Node as an array: Node would concatenate them the same way, but prints a
 * DEP0190 warning into the participant's terminal when it does.
 */
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";

export function executable(name, platform = process.platform) {
  return platform === "win32" ? `${name}.cmd` : name;
}

export function isWindows(platform = process.platform) {
  return platform === "win32";
}

/** Quote one argument for cmd.exe when Node hands the command line to a shell. */
export function windowsShellArg(arg) {
  const value = String(arg);
  if (value === "") return '""';
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildSpawnPlan(name, args = [], platform = process.platform) {
  if (platform === "win32") {
    const command = [executable(name, platform), ...args.map(windowsShellArg)].join(" ");
    return { command, args: [], shell: true };
  }
  return { command: name, args: [...args], shell: false };
}

/** Run a command to completion, inheriting the terminal. Returns the exit status. */
export function runCommand(name, args = [], options = {}) {
  const plan = buildSpawnPlan(name, args, options.platform);
  const result = spawnSync(plan.command, plan.args, {
    stdio: options.stdio ?? "inherit",
    shell: plan.shell,
    env: options.env ?? process.env,
    cwd: options.cwd,
    encoding: options.capture ? "utf8" : undefined,
    windowsHide: true,
  });
  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

/** Run a command and capture its output (never used for anything that carries a secret). */
export function captureCommand(name, args = [], options = {}) {
  return runCommand(name, args, { ...options, stdio: "pipe", capture: true });
}

/** Run a command asynchronously with inherited stdio; resolves with the exit status. */
export function runCommandAsync(name, args = [], options = {}) {
  const plan = buildSpawnPlan(name, args, options.platform);
  return new Promise((resolve) => {
    const child = spawn(plan.command, plan.args, {
      stdio: "inherit",
      shell: plan.shell,
      env: options.env ?? process.env,
      cwd: options.cwd,
      windowsHide: true,
    });
    child.on("error", (error) => resolve({ status: null, error }));
    child.on("exit", (status, signal) => resolve({ status, signal }));
  });
}

export function commandExists(name, options = {}) {
  const result = captureCommand(name, ["--version"], options);
  return !result.error && result.status === 0;
}

export function platformLabel(platform = process.platform, release = os.release()) {
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  if (platform === "win32") {
    const build = Number(String(release).split(".")[2] ?? 0);
    return build >= 22000 ? "Windows 11" : "Windows 10";
  }
  return platform;
}
