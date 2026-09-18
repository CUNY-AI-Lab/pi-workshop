import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executable,
  platformLabel,
  windowsShellArg,
  buildSpawnPlan,
} from "../src/platform.mjs";

test("executable keeps plain names on darwin and linux", () => {
  for (const platform of ["darwin", "linux"]) {
    assert.equal(executable("npm", platform), "npm");
    assert.equal(executable("npx", platform), "npx");
    assert.equal(executable("pi", platform), "pi");
  }
});

test("executable appends .cmd on win32", () => {
  assert.equal(executable("npm", "win32"), "npm.cmd");
  assert.equal(executable("npx", "win32"), "npx.cmd");
  assert.equal(executable("pi", "win32"), "pi.cmd");
});

test("platformLabel names each platform", () => {
  assert.equal(platformLabel("darwin", "25.5.0"), "macOS");
  assert.equal(platformLabel("linux", "6.8.0"), "Linux");
  assert.equal(platformLabel("win32", "10.0.22631"), "Windows 11");
  assert.equal(platformLabel("win32", "10.0.19045"), "Windows 10");
  assert.equal(platformLabel("freebsd", "14.0"), "freebsd");
});

test("windowsShellArg quotes arguments with spaces and escapes inner quotes", () => {
  assert.equal(windowsShellArg("plain"), "plain");
  assert.equal(windowsShellArg("C:\\Program Files\\pkg"), '"C:\\Program Files\\pkg"');
  assert.equal(windowsShellArg('say "hi"'), '"say \\"hi\\""');
  assert.equal(windowsShellArg(""), '""');
});

test("buildSpawnPlan on posix passes the argument array untouched without a shell", () => {
  const plan = buildSpawnPlan("pi", ["install", "/Users/me/My Dir/pkg"], "darwin");
  assert.equal(plan.command, "pi");
  assert.deepEqual(plan.args, ["install", "/Users/me/My Dir/pkg"]);
  assert.equal(plan.shell, false);
});

test("buildSpawnPlan on win32 uses the .cmd shim and shell-safe quoting for paths with spaces", () => {
  const plan = buildSpawnPlan("pi", ["install", "C:\\Users\\Jane Doe\\pkg"], "win32");
  assert.equal(plan.command, 'pi.cmd install "C:\\Users\\Jane Doe\\pkg"');
  assert.equal(plan.shell, true);
});

test("buildSpawnPlan on win32 passes no argument array, so Node does not print DEP0190", () => {
  const plan = buildSpawnPlan("pi", ["--version"], "win32");
  assert.equal(plan.command, "pi.cmd --version");
  assert.deepEqual(plan.args, []);
});
