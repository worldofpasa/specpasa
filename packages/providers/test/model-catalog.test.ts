import { afterEach, describe, expect, it, vi } from "vitest";
import { listProviderModels } from "../src/model-catalog.js";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listProviderModels", () => {
  it("lists Anthropic models with the required auth headers", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: "claude-opus-4-8", display_name: "Claude Opus 4.8" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const models = await listProviderModels({ kind: "anthropic", apiKey: "sk-ant-test" });
    expect(models).toEqual([{ id: "claude-opus-4-8", label: "Claude Opus 4.8" }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://api.anthropic.com/v1/models");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBeDefined();
  });

  it("returns nothing for Anthropic without a key instead of calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await listProviderModels({ kind: "anthropic" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists Ollama tags from the default base URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ models: [{ name: "llama3.2" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const models = await listProviderModels({ kind: "ollama" });
    expect(models).toEqual([{ id: "llama3.2", label: "llama3.2" }]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://localhost:11434/api/tags");
  });

  it("lists OpenAI-compatible /models with a Bearer key, preferring names as labels", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: "acme/model-1", name: "Model One" }, { id: "plain-model" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const models = await listProviderModels({
      kind: "openai_compatible",
      baseUrl: "https://api.example.com/v1/",
      apiKey: "k",
    });
    expect(models).toEqual([
      { id: "acme/model-1", label: "Model One" },
      { id: "plain-model", label: "plain-model" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/models");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("falls back to the preset base URL for openrouter", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await listProviderModels({ kind: "openrouter", apiKey: "k" });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
  });

  it("returns [] for unreachable endpoints, non-OK responses, and CLI kinds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await listProviderModels({ kind: "ollama" })).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    expect(await listProviderModels({ kind: "openrouter", apiKey: "k" })).toEqual([]);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await listProviderModels({ kind: "local_cli" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
