import { describe, expect, it } from "vitest";
import { parseProviderSettings, SETTINGS_LIMITS, validateExtraArgs } from "../src/settings.js";

describe("validateExtraArgs", () => {
  it("accepts ordinary flags", () => {
    expect(validateExtraArgs(["--max-turns", "3", "--verbose"])).toBeNull();
  });

  it("rejects empty and whitespace-only args", () => {
    expect(validateExtraArgs([""])).toMatch(/empty/);
    expect(validateExtraArgs(["   "])).toMatch(/empty/);
  });

  it("rejects control characters that could smuggle extra lines", () => {
    expect(validateExtraArgs(["a\nb"])).toMatch(/newlines/);
    expect(validateExtraArgs(["a\rb"])).toMatch(/newlines/);
    expect(validateExtraArgs(["a\0b"])).toMatch(/NUL/);
  });

  it("caps arg length and count", () => {
    expect(validateExtraArgs(["x".repeat(SETTINGS_LIMITS.argMax + 1)])).toMatch(/characters/);
    expect(validateExtraArgs(Array(SETTINGS_LIMITS.argsMax + 1).fill("--x"))).toMatch(/At most/);
  });
});

describe("parseProviderSettings", () => {
  it("returns empty settings for null, undefined, and non-objects", () => {
    expect(parseProviderSettings(null)).toEqual({});
    expect(parseProviderSettings(undefined)).toEqual({});
    expect(parseProviderSettings("string")).toEqual({});
    expect(parseProviderSettings(42)).toEqual({});
  });

  it("keeps a valid override and args, dropping unknown keys", () => {
    const settings = parseProviderSettings({
      systemPromptOverride: "Write tersely.",
      extraArgs: ["--flag", "value"],
      somethingElse: true,
    });
    expect(settings).toEqual({
      systemPromptOverride: "Write tersely.",
      extraArgs: ["--flag", "value"],
    });
  });

  it("drops wrong-typed and invalid-content fields instead of throwing", () => {
    expect(parseProviderSettings({ systemPromptOverride: 5 })).toEqual({});
    expect(parseProviderSettings({ systemPromptOverride: "   " })).toEqual({});
    expect(parseProviderSettings({ extraArgs: "not-an-array" })).toEqual({});
    // one bad arg poisons the whole list — half-applied args are worse than none
    expect(parseProviderSettings({ extraArgs: ["ok", "bad\narg"] })).toEqual({});
  });

  it("filters non-string array entries before validating", () => {
    expect(parseProviderSettings({ extraArgs: ["--a", 3, null, "--b"] })).toEqual({
      extraArgs: ["--a", "--b"],
    });
  });

  it("clamps an oversized prompt to the limit", () => {
    const parsed = parseProviderSettings({
      systemPromptOverride: "x".repeat(SETTINGS_LIMITS.promptMax + 100),
    });
    expect(parsed.systemPromptOverride).toHaveLength(SETTINGS_LIMITS.promptMax);
  });
});
