import { type AiProviderKind, type SpecBlock, type SpecPhase } from "@specpasa/core";

/** A reference attached to a spec, serialized for the model's context. */
export interface AgentContextItem {
  kind: "url" | "file" | "github_code" | "spec" | "comments";
  title: string;
  content: string;
}

export interface AgentRequest {
  /** The user's instruction: rough thoughts, a refine request, etc. */
  prompt: string;
  /** Current spec content, if any (blank for a fresh draft). */
  blocks?: SpecBlock[];
  context?: AgentContextItem[];
  phase: SpecPhase;
}

export type AgentEvent =
  | { type: "token"; text: string }
  | { type: "done"; blocks: SpecBlock[] }
  | { type: "error"; message: string };

/**
 * The single interface every AI backend implements — local CLI subprocess,
 * Ollama, Anthropic, or any OpenAI-compatible endpoint (ADR-4). Methods
 * stream AgentEvents so the editor island can render tokens as they arrive.
 */
export interface SpecAgent {
  readonly kind: AiProviderKind;
  readonly name: string;
  draft(request: AgentRequest): AsyncIterable<AgentEvent>;
  refine(request: AgentRequest): AsyncIterable<AgentEvent>;
  summarize(request: AgentRequest): AsyncIterable<AgentEvent>;
}

/** Result of probing the host for available AI backends. */
export interface DetectedProvider {
  kind: AiProviderKind;
  name: string;
  /** e.g. CLI path or base URL that responded. */
  detail: string;
  /** For local_cli detections: the bare command found on PATH. */
  command?: string;
  /** Whether an adapter exists for this detection (CLIs may be detected
   * before an adapter ships). Non-CLI detections are always usable. */
  usable?: boolean;
}
