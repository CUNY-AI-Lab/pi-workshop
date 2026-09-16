/**
 * CUNY AI Lab provider for Pi.
 *
 * Registers a native pi-ai provider (`cail`) that speaks the OpenAI
 * chat-completions API against https://tools.ailab.gc.cuny.edu/v1 and
 * discovers its models dynamically from `/v1/models` on every refresh.
 *
 * Credentials: Pi's stored `cail` credential (set by the workshop installer or
 * `/login`), or AILAB_API_KEY for advanced users.
 */
import { createProvider, envApiKeyAuth, openAICompletionsApi, type Provider, type RefreshModelsContext } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CAIL_BASE_URL, CAIL_PROVIDER_ID, CAIL_PROVIDER_NAME, CatalogError, toPiModels } from "../src/cail-catalog.mjs";

type FetchLike = typeof globalThis.fetch;

export interface BuildOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  /** Baseline models registered immediately (normally the catalog fetched at load time). */
  initialModels?: ReturnType<typeof toPiModels>;
}

export interface StartupOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

const STARTUP_TIMEOUT_MS = 5000;

/**
 * Fetch the public catalog once at extension load so `/model` and
 * `pi --list-models` see CUNY AI Lab models before Pi's first network refresh.
 * Never throws: offline (`PI_OFFLINE` / `--offline`) or any failure yields [],
 * and `fetchModels` fills the catalog in later.
 */
export async function loadStartupModels({ fetch: fetchImpl = globalThis.fetch, baseUrl = CAIL_BASE_URL, env = process.env, timeoutMs = STARTUP_TIMEOUT_MS }: StartupOptions = {}) {
  if (env.PI_OFFLINE !== undefined && env.PI_OFFLINE !== "" && env.PI_OFFLINE !== "0" && env.PI_OFFLINE !== "false") return [];
  try {
    const response = await fetchImpl(`${baseUrl}/models`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];
    return toPiModels(await response.json(), { baseUrl });
  } catch {
    return [];
  }
}

async function fetchCailModels(context: RefreshModelsContext, { fetch: fetchImpl = globalThis.fetch, baseUrl = CAIL_BASE_URL }: BuildOptions) {
  const headers: Record<string, string> = { Accept: "application/json" };
  const credential = context.credential;
  if (credential?.type === "api_key" && typeof credential.key === "string" && credential.key.trim() !== "") {
    headers.Authorization = `Bearer ${credential.key.trim()}`;
  }
  const response = await fetchImpl(`${baseUrl}/models`, { method: "GET", headers, signal: context.signal });
  if (!response.ok) {
    throw new Error(`CUNY AI Lab model discovery failed: HTTP ${response.status} from ${baseUrl}/models`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("CUNY AI Lab returned a model list that is not valid JSON.");
  }
  try {
    return toPiModels(payload, { baseUrl });
  } catch (error) {
    if (error instanceof CatalogError) throw new Error(error.message);
    throw error;
  }
}

export function buildCailProvider(options: BuildOptions = {}): Provider<"openai-completions"> & {
  fetchModels: (context: RefreshModelsContext) => Promise<ReturnType<typeof toPiModels>>;
} {
  const baseUrl = options.baseUrl ?? CAIL_BASE_URL;
  const fetchModels = (context: RefreshModelsContext) => fetchCailModels(context, { ...options, baseUrl });
  const provider = createProvider<"openai-completions">({
    id: CAIL_PROVIDER_ID,
    name: CAIL_PROVIDER_NAME,
    baseUrl,
    auth: { apiKey: envApiKeyAuth("CUNY AI Lab API key", ["AILAB_API_KEY"]) },
    models: options.initialModels ?? [],
    fetchModels,
    api: openAICompletionsApi(),
  });
  return Object.assign(provider, { fetchModels });
}

export default async function cailExtension(pi: ExtensionAPI, startup: StartupOptions = {}): Promise<void> {
  const initialModels = await loadStartupModels(startup);
  pi.registerProvider(buildCailProvider({ fetch: startup.fetch, baseUrl: startup.baseUrl, initialModels }));
}
