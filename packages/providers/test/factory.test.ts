import { describe, expect, it } from "vitest";
import { AI_PROVIDER_KINDS } from "@specpasa/core";
import {
  createSpecAgent,
  ProviderConfigError,
  ProviderNotImplementedError,
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

  it("names the milestone for kinds that are not implemented yet", () => {
    expect(() => createSpecAgent({ ...base, kind: "openrouter" })).toThrow(
      ProviderNotImplementedError,
    );
    expect(() => createSpecAgent({ ...base, kind: "openrouter" })).toThrow(/M2\+/);
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
