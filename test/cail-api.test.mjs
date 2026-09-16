import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateApiKey, fetchModelCatalog, checkApiKey } from "../src/cail-api.mjs";

const FAKE_KEY = "cail-test-super-secret-12345";
const catalog = readFileSync(new URL("./fixtures/models-catalog.json", import.meta.url), "utf8");

function jsonResponse(status, body) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchStub(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  fetch.calls = calls;
  return fetch;
}

function assertNoSecret(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, Object.getOwnPropertyNames(value ?? {}));
  assert.ok(!String(text).includes(FAKE_KEY), `secret leaked: ${text}`);
}

test("validateApiKey sends the bearer token only to the CAIL quota endpoint", async () => {
  const fetch = fetchStub(() => jsonResponse(200, { object: "quota" }));
  const result = await validateApiKey(FAKE_KEY, { fetch });
  assert.equal(result.status, "valid");
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://tools.ailab.gc.cuny.edu/v1/quota");
  assert.equal(fetch.calls[0].init.headers.Authorization, `Bearer ${FAKE_KEY}`);
  assertNoSecret(result);
});

test("validateApiKey reports 401 as an invalid key", async () => {
  const fetch = fetchStub(() => jsonResponse(401, { error: { code: "invalid_credential" } }));
  const result = await validateApiKey(FAKE_KEY, { fetch });
  assert.equal(result.status, "invalid");
  assert.match(result.message, /not accepted/);
  assertNoSecret(result);
});

test("validateApiKey reports 403 as recognized but not authorized", async () => {
  const fetch = fetchStub(() => jsonResponse(403, { error: { code: "insufficient_scope" } }));
  const result = await validateApiKey(FAKE_KEY, { fetch });
  assert.equal(result.status, "forbidden");
  assert.match(result.message, /recognized/);
  assert.doesNotMatch(result.message, /invalid|not accepted/i);
});

test("validateApiKey never calls 429 or 5xx an invalid key", async () => {
  for (const status of [429, 500, 502, 503]) {
    const fetch = fetchStub(() => jsonResponse(status, { error: {} }));
    const result = await validateApiKey(FAKE_KEY, { fetch });
    assert.notEqual(result.status, "invalid", `status ${status}`);
    assert.equal(result.status, status === 429 ? "rate_limited" : "server_error");
    assert.doesNotMatch(result.message, /invalid|not accepted/i);
    assertNoSecret(result);
  }
});

test("validateApiKey classifies timeouts, DNS, TLS and aborts as network errors", async () => {
  const failures = [
    Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }),
    Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }),
    Object.assign(new TypeError("fetch failed"), { cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } }),
    Object.assign(new Error("This operation was aborted"), { name: "AbortError" }),
  ];
  for (const failure of failures) {
    const fetch = fetchStub(() => { throw failure; });
    const result = await validateApiKey(FAKE_KEY, { fetch });
    assert.equal(result.status, "network_error", failure.message);
    assert.match(result.message, /could not be reached/);
    assert.doesNotMatch(result.message, /invalid|not accepted/i);
    assertNoSecret(result);
  }
});

test("validateApiKey rejects empty keys without a network call", async () => {
  const fetch = fetchStub(() => jsonResponse(200, {}));
  const result = await validateApiKey("   ", { fetch });
  assert.equal(result.status, "invalid");
  assert.equal(fetch.calls.length, 0);
});

test("fetchModelCatalog returns Pi-ready models from a valid catalog", async () => {
  const fetch = fetchStub(() => jsonResponse(200, catalog));
  const result = await fetchModelCatalog({ fetch });
  assert.equal(result.ok, true);
  assert.equal(fetch.calls[0].url, "https://tools.ailab.gc.cuny.edu/v1/models");
  assert.ok(result.models.length >= 3);
});

test("fetchModelCatalog reports empty and malformed catalogs distinctly", async () => {
  const empty = await fetchModelCatalog({ fetch: fetchStub(() => jsonResponse(200, { data: [] })) });
  assert.equal(empty.ok, true);
  assert.equal(empty.models.length, 0);

  const malformed = await fetchModelCatalog({ fetch: fetchStub(() => jsonResponse(200, { nope: true })) });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, "malformed");

  const notJson = await fetchModelCatalog({ fetch: fetchStub(() => new Response("<html>", { status: 200 })) });
  assert.equal(notJson.ok, false);
  assert.equal(notJson.status, "malformed");
});

test("checkApiKey combines validation with the model count and leaks nothing", async () => {
  const fetch = fetchStub((url) =>
    url.endsWith("/quota") ? jsonResponse(200, {}) : jsonResponse(200, catalog),
  );
  const result = await checkApiKey(FAKE_KEY, { fetch });
  assert.equal(result.status, "valid");
  assert.equal(typeof result.modelCount, "number");
  assert.ok(result.modelCount >= 3);
  assertNoSecret(result);
});

test("checkApiKey does not fetch the catalog when the key is rejected", async () => {
  const fetch = fetchStub(() => jsonResponse(401, {}));
  const result = await checkApiKey(FAKE_KEY, { fetch });
  assert.equal(result.status, "invalid");
  assert.equal(fetch.calls.length, 1);
});
