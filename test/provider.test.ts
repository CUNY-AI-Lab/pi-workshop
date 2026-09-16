import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCailProvider } from "../extensions/cail.ts";

const FAKE_KEY = "cail-test-super-secret-12345";
const catalog = readFileSync(new URL("./fixtures/models-catalog.json", import.meta.url), "utf8");

function fetchStub(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return Object.assign(fetch, { calls });
}

function refreshContext(overrides: Record<string, unknown> = {}) {
  return {
    credential: { type: "api_key" as const, key: FAKE_KEY },
    allowNetwork: true,
    signal: new AbortController().signal,
    publish: async () => true,
    ...overrides,
  };
}

test("provider is registered as cail / CUNY AI Lab on the gateway base URL with env fallback auth", () => {
  const provider = buildCailProvider({ fetch: fetchStub(() => new Response(catalog)) });
  assert.equal(provider.id, "cail");
  assert.equal(provider.name, "CUNY AI Lab");
  assert.equal(provider.baseUrl, "https://tools.ailab.gc.cuny.edu/v1");
  assert.equal(provider.auth.apiKey?.name, "CUNY AI Lab API key");
  assert.equal(typeof provider.auth.apiKey?.login, "function", "supports /login");
  assert.deepEqual(provider.getModels(), [], "no hard-coded models");
});

test("stored credential wins over AILAB_API_KEY when resolving auth", async () => {
  const provider = buildCailProvider({ fetch: fetchStub(() => new Response(catalog)) });
  const ctx = { env: async (name: string) => (name === "AILAB_API_KEY" ? "env-key" : undefined), fileExists: async () => false };
  const stored = await provider.auth.apiKey!.resolve({ ctx, credential: { type: "api_key", key: FAKE_KEY }, signal: new AbortController().signal });
  assert.equal(stored?.auth.apiKey, FAKE_KEY);
  const fromEnv = await provider.auth.apiKey!.resolve({ ctx, credential: undefined, signal: new AbortController().signal });
  assert.equal(fromEnv?.auth.apiKey, "env-key");
});

test("fetchModels calls /v1/models with the effective credential and honors the abort signal", async () => {
  const fetch = fetchStub(() => new Response(catalog, { headers: { "content-type": "application/json" } }));
  const provider = buildCailProvider({ fetch });
  const controller = new AbortController();
  const models = await provider.fetchModels(refreshContext({ signal: controller.signal }));
  assert.equal(fetch.calls[0].url, "https://tools.ailab.gc.cuny.edu/v1/models");
  assert.equal((fetch.calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(fetch.calls[0].init.signal, controller.signal);
  assert.ok(models.length >= 3);
  assert.ok(models.every((m) => m.provider === "cail" && m.api === "openai-completions"));
  assert.ok(!models.some((m) => m.id === "whisper-large-v3-turbo"));
});

test("fetchModels works without a stored credential because the catalog is public", async () => {
  const fetch = fetchStub(() => new Response(catalog));
  const provider = buildCailProvider({ fetch });
  const models = await provider.fetchModels(refreshContext({ credential: undefined }));
  assert.equal((fetch.calls[0].init.headers as Record<string, string>).Authorization, undefined);
  assert.ok(models.length > 0);
});

test("fetchModels raises a useful error for HTTP failures and malformed catalogs without leaking the key", async () => {
  const bad = buildCailProvider({ fetch: fetchStub(() => new Response("nope", { status: 500 })) });
  await assert.rejects(bad.fetchModels(refreshContext()), (error: Error) => {
    assert.match(error.message, /CUNY AI Lab/);
    assert.match(error.message, /500/);
    assert.ok(!error.message.includes(FAKE_KEY));
    return true;
  });
  const malformed = buildCailProvider({ fetch: fetchStub(() => new Response(JSON.stringify({ models: [] }))) });
  await assert.rejects(malformed.fetchModels(refreshContext()), /model list/);
});

test("publishing through Pi's createProvider merges fetched models into getModels()", async () => {
  const provider = buildCailProvider({ fetch: fetchStub(() => new Response(catalog)) });
  let update: (() => void) | undefined;
  await provider.refreshModels!({
    ...refreshContext(),
    publish: async (publication: { update?: () => void; persist?: unknown }) => {
      update = publication.update;
      publication.update?.();
      assert.ok(publication.persist, "fetched catalog is persisted for the next session");
      return true;
    },
  } as never);
  assert.ok(update);
  assert.ok(provider.getModels().length >= 3);
});

test("loadStartupModels fetches the public catalog so models are visible before any refresh", async () => {
  const { loadStartupModels } = await import("../extensions/cail.ts");
  const fetch = fetchStub(() => new Response(catalog));
  const models = await loadStartupModels({ fetch, env: {} });
  assert.ok(models.length >= 3);
  assert.equal((fetch.calls[0].init.headers as Record<string, string>).Authorization, undefined, "no credential needed");
  assert.ok(fetch.calls[0].init.signal instanceof AbortSignal, "bounded by a timeout");
});

test("loadStartupModels returns no models offline or on failure instead of breaking Pi startup", async () => {
  const { loadStartupModels } = await import("../extensions/cail.ts");
  const offline = fetchStub(() => new Response(catalog));
  assert.deepEqual(await loadStartupModels({ fetch: offline, env: { PI_OFFLINE: "1" } }), []);
  assert.equal(offline.calls.length, 0);
  const failing = fetchStub(() => { throw new TypeError("fetch failed"); });
  assert.deepEqual(await loadStartupModels({ fetch: failing, env: {} }), []);
  const malformed = fetchStub(() => new Response("<html>"));
  assert.deepEqual(await loadStartupModels({ fetch: malformed, env: {} }), []);
});

test("the extension factory registers the provider with startup models as its baseline", async () => {
  const mod = await import("../extensions/cail.ts");
  const fetch = fetchStub(() => new Response(catalog));
  const registered: unknown[] = [];
  await mod.default({ registerProvider: (p: unknown) => registered.push(p) } as never, { fetch, env: {} });
  assert.equal(registered.length, 1);
  const provider = registered[0] as { id: string; getModels: () => unknown[] };
  assert.equal(provider.id, "cail");
  assert.ok(provider.getModels().length >= 3, "models available immediately after load");
});
