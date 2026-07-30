import { blocksFromMarkdown } from "@specpasa/core";
import { systemPrompt, userPrompt } from "./prompts.js";
import { type AgentEvent, type AgentRequest, type SpecAgent } from "./types.js";

export interface OllamaAgentConfig {
  baseUrl?: string;
  model: string;
  /** Appended to the built-in system prompt (see prompts.ts). */
  systemPromptOverride?: string;
}

export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

/** Yield ndjson lines from a streaming response body as they complete. */
async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    yield* lines.filter((line) => line.trim());
  }
  if (buffer.trim()) yield buffer;
}

/** Ollama adapter (ADR-4): streaming chat API on the local Ollama server. */
export function createOllamaAgent(config: OllamaAgentConfig): SpecAgent {
  const baseUrl = (config.baseUrl ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, "");

  async function* run(
    request: AgentRequest,
    mode: "draft" | "refine" | "summarize",
  ): AsyncIterable<AgentEvent> {
    let text = "";
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt(request, config.systemPromptOverride) },
            { role: "user", content: userPrompt(request, mode) },
          ],
        }),
      });
      if (!response.ok || !response.body) {
        yield { type: "error", message: `Ollama returned ${response.status}` };
        return;
      }
      for await (const line of ndjsonLines(response.body)) {
        const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (chunk.error) {
          yield { type: "error", message: chunk.error };
          return;
        }
        if (chunk.message?.content) {
          text += chunk.message.content;
          yield { type: "token", text: chunk.message.content };
        }
      }
      yield { type: "done", blocks: blocksFromMarkdown(text, request.blocks) };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    kind: "ollama",
    name: `Ollama (${config.model})`,
    draft: (request) => run(request, "draft"),
    refine: (request) => run(request, "refine"),
    summarize: (request) => run(request, "summarize"),
  };
}
