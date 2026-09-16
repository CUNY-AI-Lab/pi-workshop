import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, HELP_TEXT } from "../src/args.mjs";

test("parseArgs defaults to the full interactive setup", () => {
  const options = parseArgs([]);
  assert.deepEqual(options, {
    command: "setup",
    skipLazypi: false,
    skipAuth: false,
    windowsSettings: true,
    replaceKey: false,
    errors: [],
  });
});

test("parseArgs recognizes every documented flag", () => {
  assert.equal(parseArgs(["--help"]).command, "help");
  assert.equal(parseArgs(["-h"]).command, "help");
  assert.equal(parseArgs(["--version"]).command, "version");
  assert.equal(parseArgs(["--doctor"]).command, "doctor");
  assert.equal(parseArgs(["--uninstall"]).command, "uninstall");
  const options = parseArgs(["--skip-lazypi", "--skip-auth", "--no-windows-settings", "--replace-key"]);
  assert.equal(options.skipLazypi, true);
  assert.equal(options.skipAuth, true);
  assert.equal(options.windowsSettings, false);
  assert.equal(options.replaceKey, true);
});

test("parseArgs rejects unknown flags and never accepts a key argument", () => {
  const options = parseArgs(["--api-key", "secret"]);
  assert.ok(options.errors.length > 0);
  assert.ok(!options.errors.join(" ").includes("secret"));
  assert.match(HELP_TEXT, /--doctor/);
  assert.match(HELP_TEXT, /--skip-auth/);
  assert.doesNotMatch(HELP_TEXT, /--api-key/);
});
