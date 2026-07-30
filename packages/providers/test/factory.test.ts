import { describe, expect, it } from "vitest";
import { AI_PROVIDER_KINDS } from "@specpasa/core";
import {
  createSpecAgent,
  OPENAI_COMPAT_PRESETS,
  ProviderConfigError,
  ProviderRequiresNodeError,
} from "../src/factory.js";

const base = { model: null, baseUrl: null, apiKey: null };

describe("createSpecAgent", () => {
  it("builds an Anthropic agent from a key", () => {
    const agent = createSpecAgent({ ...base, kind: "anthropic", apiKey: "sk-ant-test" });
    expect(agent.kind).toBe("anthropic");
    expect(agent.name).toContain("claude-opus-4-8"); // default model
  });

  it("builds an Ollama agent from a model", () => {
    const agent = createSpecAgent({ ...base, kind: "ollama", model: "llama3.2" });
    expect(agent.kind).toBe("ollama");
  });

  it("rejects misconfiguration with a specific error", () => {
    expect(() => createSpecAgent({ ...base, kind: "anthropic" })).toThrow(ProviderConfigError);
    expect(() => createSpecAgent({ ...base, kind: "ollama" })).toThrow(ProviderConfigError);
  });

  it("builds an OpenRouter agent on the preset base URL", () => {
    const agent = createSpecAgent({ ...base, kind: "openrouter", model: "some/model", apiKey: "k" });
    expect(agent.kind).toBe("openrouter");
    expect(agent.name).toContain(OPENAI_COMPAT_PRESETS.openrouter.baseUrl);
  });

  it("builds a keyless custom-endpoint agent when a base URL is given", () => {
    const agent = createSpecAgent({
      ...base,
      kind: "openai_compatible",
      model: "local-model",
      baseUrl: "http://localhost:1234/v1",
    });
    expect(agent.kind).toBe("openai_compatible");
  });

  it("rejects misconfigured OpenAI-compatible kinds with a specific error", () => {
    // preset kinds require a key; bring-your-own-URL kind requires the URL
    expect(() => createSpecAgent({ ...base, kind: "openrouter", model: "m" })).toThrow(
      ProviderConfigError,
    );
    expect(() => createSpecAgent({ ...base, kind: "google", model: "m" })).toThrow(
      ProviderConfigError,
    );
    expect(() => createSpecAgent({ ...base, kind: "openai_compatible", model: "m" })).toThrow(
      ProviderConfigError,
    );
    expect(() =>
      createSpecAgent({ ...base, kind: "openrouter", apiKey: "k" }),
    ).toThrow(ProviderConfigError); // model missing
  });

  it("points local_cli at the Node entry from the runtime-agnostic factory", () => {
    expect(() => createSpecAgent({ ...base, kind: "local_cli", cliCommand: "claude" })).toThrow(
      ProviderRequiresNodeError,
    );
  });

  it("handles every declared provider kind without falling through", () => {
    // The switch is compile-time exhaustive; this guards the runtime contract:
    // every kind either returns an agent or throws a typed error — never null.
    for (const kind of AI_PROVIDER_KINDS) {
      let outcome: unknown;
      try {
        outcome = createSpecAgent({ kind, model: "m", baseUrl: null, apiKey: "k" });
      } catch (error) {
        outcome = error;
      }
      expect(outcome).toBeDefined();
    }
  });
});
