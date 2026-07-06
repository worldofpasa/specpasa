export const SPEC_PHASES = ["prd", "erd", "tasks"] as const;
export type SpecPhase = (typeof SPEC_PHASES)[number];

export const SPEC_STATUSES = ["draft", "in_review", "frozen"] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];

export const MEMBER_ROLES = ["owner", "editor", "commenter", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const REFERENCE_KINDS = ["url", "file", "github_code", "spec"] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const AI_PROVIDER_KINDS = [
  "local_cli",
  "ollama",
  "openai_compatible",
  "anthropic",
  "google",
  "openrouter",
] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export const INTEGRATION_KINDS = ["github", "google_docs", "jira", "linear"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const BLOCK_TYPES = ["markdown", "mermaid"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * The unit of spec content. Block IDs are stable ULIDs assigned once and kept
 * across versions — they are the anchor for comment threads today and the
 * CRDT anchor primitive later (docs/architecture.md ADR-5).
 */
export interface SpecBlock {
  block_id: string;
  type: BlockType;
  markdown: string;
}
