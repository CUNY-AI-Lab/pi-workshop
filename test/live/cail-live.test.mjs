/**
 * Optional integration test against the real CUNY AI Lab gateway.
 * Skipped unless CAIL_LIVE_TEST=1 and CAIL_LIVE_TEST_KEY are set.
 * The key is read from the environment in-process and never printed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkApiKey, fetchModelCatalog, validateApiKey } from "../../src/cail-api.mjs";

const enabled = process.env.CAIL_LIVE_TEST === "1" && Boolean(process.env.CAIL_LIVE_TEST_KEY);

test("live: public catalog lists text-generation models", { skip: !enabled && "set CAIL_LIVE_TEST=1 and CAIL_LIVE_TEST_KEY" }, async () => {
  const result = await fetchModelCatalog();
  assert.equal(result.ok, true);
  assert.ok(result.models.length > 0);
  assert.ok(result.models.every((m) => m.provider === "cail"));
});

test("live: a bogus key is rejected with 'invalid', never a network error", { skip: !enabled && "live test disabled" }, async () => {
  const result = await validateApiKey("cail-bogus-key-for-tests");
  assert.equal(result.status, "invalid");
});

test("live: the configured key is accepted and models are counted", { skip: !enabled && "live test disabled" }, async () => {
  const result = await checkApiKey(process.env.CAIL_LIVE_TEST_KEY);
  assert.equal(result.status, "valid");
  assert.ok(result.modelCount > 0);
  assert.ok(!JSON.stringify(result).includes(process.env.CAIL_LIVE_TEST_KEY));
});
