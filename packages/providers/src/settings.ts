/**
 * Typed view of the ai_provider_configs.settings JSON column: per-provider
 * overrides layered on top of the built-in behavior. The column is stored
 * data — parse leniently on the way out of the DB, validate strictly at the
 * action boundary on the way in.
 */
export interface ProviderSettings {
  /** Appended to the built-in system prompt — never replaces it (the base
   * prompt carries the output contract block parsing depends on). */
  systemPromptOverride?: string;
  /** local_cli only: extra argv entries for the spawned CLI. */
  extraArgs?: string[];
}

export const SETTINGS_LIMITS = {
  /** Max override length, chars. */
  promptMax: 8000,
  /** Max length of one extra arg, chars. */
  argMax: 256,
  /** Max number of extra args. */
  argsMax: 16,
} as const;

/**
 * Strict content rules for extra CLI args. Args are argv entries appended to
 * an allowlisted binary spawned without a shell, so they cannot inject
 * commands — but they CAN change CLI behavior (e.g. a flag that turns off a
 * read-only mode). Mitigations: editor-role gating on the actions, these
 * caps, visibility in the settings UI, and each session's read-only defaults
 * plus the kill timer. Returns a user-displayable problem, or null when ok.
 */
export function validateExtraArgs(args: string[]): string | null {
  if (args.length > SETTINGS_LIMITS.argsMax) {
    return `At most ${SETTINGS_LIMITS.argsMax} extra arguments`;
  }
  for (const arg of args) {
    if (!arg.trim()) return "Extra arguments cannot be empty";
    if (arg.length > SETTINGS_LIMITS.argMax) {
      return `Each argument must stay under ${SETTINGS_LIMITS.argMax} characters`;
    }
    if (/[\0\r\n]/.test(arg)) return "Arguments cannot contain newlines or NUL bytes";
  }
  return null;
}

/**
 * Lenient parse for stored settings: never throws, drops anything that is
 * not the expected shape, clamps to limits. Rows can predate validation.
 */
export function parseProviderSettings(value: unknown): ProviderSettings {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  const settings: ProviderSettings = {};
  if (typeof raw.systemPromptOverride === "string" && raw.systemPromptOverride.trim()) {
    settings.systemPromptOverride = raw.systemPromptOverride.slice(0, SETTINGS_LIMITS.promptMax);
  }
  if (Array.isArray(raw.extraArgs)) {
    const args = raw.extraArgs
      .filter((arg): arg is string => typeof arg === "string")
      .slice(0, SETTINGS_LIMITS.argsMax);
    if (args.length > 0 && validateExtraArgs(args) === null) settings.extraArgs = args;
  }
  return settings;
}
