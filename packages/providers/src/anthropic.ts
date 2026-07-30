import Anthropic from "@anthropic-ai/sdk";
import { blocksFromMarkdown } from "@specpasa/core";
import { systemPrompt, userPrompt } from "./prompts.js";
import { type AgentEvent, type AgentRequest, type SpecAgent } from "./types.js";

export interface AnthropicAgentConfig {
  apiKey: string;
  model?: string;
  /** Appended to the built-in system prompt (see prompts.ts). */
  systemPromptOverride?: string;
}

const DEFAULT_MODEL = "claude-opus-4-8";

/** Anthropic adapter (ADR-4): official SDK, streaming, adaptive thinking. */
export function createAnthropicAgent(config: AnthropicAgentConfig): SpecAgent {
  const client = new Anthropic({ apiKey: config.apiKey });
  const model = config.model ?? DEFAULT_MODEL;

  async function* run(
    request: AgentRequest,
    mode: "draft" | "refine" | "summarize",
  ): AsyncIterable<AgentEvent> {
    let text = "";
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        system: systemPrompt(request, config.systemPromptOverride),
        messages: [{ role: "user", content: userPrompt(request, mode) }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          yield { type: "token", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        yield { type: "error", message: "The model declined this request." };
        return;
      }
      yield { type: "done", blocks: blocksFromMarkdown(text, request.blocks) };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    kind: "anthropic",
    name: `Anthropic (${model})`,
    draft: (request) => run(request, "draft"),
    refine: (request) => run(request, "refine"),
    summarize: (request) => run(request, "summarize"),
  };
}
