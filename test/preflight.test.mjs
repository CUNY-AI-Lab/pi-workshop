import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNodeVersion, MIN_NODE_VERSION } from "../src/preflight.mjs";

test("minimum node version is 22.19.0", () => {
  assert.equal(MIN_NODE_VERSION, "22.19.0");
});

test("checkNodeVersion rejects versions below the minimum", () => {
  const result = checkNodeVersion("v22.18.0", "/usr/bin/node");
  assert.equal(result.ok, false);
  assert.equal(result.version, "v22.18.0");
  assert.equal(result.execPath, "/usr/bin/node");
  assert.match(result.message, /22\.19\.0 or newer/);
  assert.match(result.message, /v22\.18\.0/);
  assert.match(result.message, /\/usr\/bin\/node/);
});

test("checkNodeVersion accepts the minimum and newer releases", () => {
  for (const v of ["v22.19.0", "v22.19.1", "v23.4.0", "v24.8.0", "v26.0.0"]) {
    assert.equal(checkNodeVersion(v, "/n").ok, true, v);
  }
});

test("checkNodeVersion rejects older major versions and garbage", () => {
  assert.equal(checkNodeVersion("v20.19.0", "/n").ok, false);
  assert.equal(checkNodeVersion("weird", "/n").ok, false);
});
