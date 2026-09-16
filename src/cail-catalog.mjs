/**
 * CUNY AI Lab model catalog → Pi `Model[]`.
 *
 * Availability AND capability metadata both come from the live gateway:
 * `GET https://tools.ailab.gc.cuny.edu/v1/models` returns OpenAI-style entries
 * enriched with `name`, `task`, `capabilities`, `context_length`, `pricing`,
 * `status` and `sunset`. The public catalog page at ailab.gc.cuny.edu/models
 * reads the same data, so no separate metadata file is needed.
 *
 * Only text-generation models that accept tool calls are offered, because Pi
 * sends its tools on every request. Speech and sunset models are dropped.
 *
 * Pure functions, no I/O. Shared by the Pi extension and the bootstrapper.
 */
export const CAIL_PROVIDER_ID = "cail";
export const CAIL_PROVIDER_NAME = "CUNY AI Lab";
export const CAIL_BASE_URL = "https://tools.ailab.gc.cuny.edu/v1";

const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 16384;

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogError";
  }
}

/** Validate the OpenAI-style list shape and return entries with usable ids. */
export function parseCatalog(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.data)) {
    throw new CatalogError("CUNY AI Lab did not return a standard OpenAI-style model list (expected { data: [...] }).");
  }
  const entries = [];
  for (const entry of payload.data) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id !== "string" || entry.id.trim() === "") continue;
    entries.push(entry);
  }
  return entries;
}

function capabilities(entry) {
  return Array.isArray(entry.capabilities) ? entry.capabilities.filter((c) => typeof c === "string") : [];
}

function isTextGeneration(entry) {
  const caps = capabilities(entry);
  if (caps.length > 0) return caps.includes("text-generation");
  if (typeof entry.task === "string") return /text generation/i.test(entry.task);
  // No capability information at all: offer the model with conservative defaults.
  return true;
}

/**
 * Pi is a coding agent and sends its tools with every request; the gateway
 * rejects such requests (400 capability_unsupported) for models that lack
 * function calling. Exclude those when capabilities are known.
 */
function supportsTools(entry) {
  const caps = capabilities(entry);
  if (caps.length === 0) return true;
  return caps.includes("function-calling");
}

function isRetired(entry, now) {
  if (typeof entry.status === "string" && /^(retired|disabled|inactive|removed)$/i.test(entry.status)) return true;
  if (typeof entry.sunset === "string") {
    const sunset = Date.parse(entry.sunset);
    if (!Number.isNaN(sunset) && sunset <= now) return true;
  }
  return false;
}

function positiveInteger(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function cost(entry) {
  const pricing = entry.pricing;
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (!pricing || typeof pricing !== "object") return zero;
  if (pricing.currency !== "USD" || pricing.unit !== "million_tokens") return zero;
  const input = Number.isFinite(pricing.input) ? pricing.input : 0;
  const output = Number.isFinite(pricing.output) ? pricing.output : 0;
  return { input, output, cacheRead: 0, cacheWrite: 0 };
}

export function toPiModel(entry, { baseUrl = CAIL_BASE_URL } = {}) {
  const caps = capabilities(entry);
  const contextWindow = positiveInteger(entry.context_length) ?? DEFAULT_CONTEXT_WINDOW;
  const maxTokens = Math.min(DEFAULT_MAX_TOKENS, Math.max(1024, Math.floor(contextWindow / 2)));
  const name =
    (typeof entry.name === "string" && entry.name.trim()) ||
    (typeof entry.model_name === "string" && entry.model_name.trim()) ||
    entry.id;
  return {
    id: entry.id,
    name,
    provider: CAIL_PROVIDER_ID,
    api: "openai-completions",
    baseUrl,
    reasoning: caps.includes("reasoning"),
    input: caps.includes("vision") ? ["text", "image"] : ["text"],
    contextWindow,
    maxTokens,
    cost: cost(entry),
  };
}

/** Convert a raw `/v1/models` payload into Pi models. Throws CatalogError when the whole payload is malformed. */
export function toPiModels(payload, options = {}) {
  const now = options.now ?? Date.now();
  return parseCatalog(payload)
    .filter((entry) => isTextGeneration(entry) && supportsTools(entry) && !isRetired(entry, now))
    .map((entry) => toPiModel(entry, options));
}
