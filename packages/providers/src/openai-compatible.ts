import { blocksFromMarkdown } from "@specpasa/core";
import { systemPrompt, userPrompt } from "./prompts.js";
import { type AgentEvent, type AgentRequest, type SpecAgent } from "./types.js";

export interface OpenAiCompatibleAgentConfig {
  /** API root the /chat/completions path is appended to, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  /** Optional — LM Studio / vLLM style local servers are typically keyless. */
  apiKey?: string;
  model: string;
  /** Reported SpecAgent.kind; presets (openrouter, google) share this adapter. */
  kind?: "openai_compatible" | "openrouter" | "google";
}

/** Yield the data payloads of an SSE stream as they complete. */
async function* sseDataLines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      // Blank lines are event separators; ":"-prefixed lines are keep-alive comments.
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
    }
  }
}

interface ChatCompletionChunk {
  choices?: { delta?: { content?: string | null } }[];
  error?: { message?: string } | string;
}

/** One parsed SSE data payload, reduced to what the event loop acts on. */
function chunkEvent(data: string): { token?: string; error?: string; stop?: boolean } {
  if (data === "[DONE]") return { stop: true };
  let chunk: ChatCompletionChunk;
  try {
    chunk = JSON.parse(data) as ChatCompletionChunk;
  } catch {
    return {}; // tolerate malformed keep-alive payloads from proxies
  }
  if (chunk.error) {
    const message =
      typeof chunk.error === "string" ? chunk.error : (chunk.error.message ?? "stream error");
    return { error: message };
  }
  const token = chunk.choices?.[0]?.delta?.content;
  return token ? { token } : {};
}

/** Error bodies carry the useful message (quota, bad model id, …). */
async function failureEvent(response: Response, model: string): Promise<AgentEvent> {
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  return {
    type: "error",
    message: `${model} endpoint returned ${response.status}${detail ? `: ${detail}` : ""}`,
  };
}

function buildHeaders(config: OpenAiCompatibleAgentConfig, baseUrl: string): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  if (isOpenRouterHost(baseUrl)) headers["x-title"] = "specpasa";
  return headers;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** OpenAI-compatible adapter (ADR-4): one streaming chat-completions client
 * covers OpenAI, OpenRouter, Google's compatibility endpoint, xAI, Cohere,
 * Together, LM Studio, vLLM, and any custom base URL. */
export function createOpenAiCompatibleAgent(config: OpenAiCompatibleAgentConfig): SpecAgent {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const kind = config.kind ?? "openai_compatible";
  const headers = buildHeaders(config, baseUrl);

  async function* run(
    request: AgentRequest,
    mode: "draft" | "refine" | "summarize",
  ): AsyncIterable<AgentEvent> {
    let text = "";
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt(request) },
            { role: "user", content: userPrompt(request, mode) },
          ],
        }),
      });
      if (!response.ok || !response.body) {
        yield await failureEvent(response, config.model);
        return;
      }
      for await (const data of sseDataLines(response.body)) {
        const event = chunkEvent(data);
        if (event.stop) break;
        if (event.error) {
          yield { type: "error", message: event.error };
          return;
        }
        if (event.token) {
          text += event.token;
          yield { type: "token", text: event.token };
        }
      }
      if (!text.trim()) {
        yield { type: "error", message: `${config.model} produced no output` };
        return;
      }
      yield { type: "done", blocks: blocksFromMarkdown(text, request.blocks) };
    } catch (error) {
      yield { type: "error", message: errorMessage(error) };
    }
  }

  return {
    kind,
    name: `${config.model} (${baseUrl})`,
    draft: (request) => run(request, "draft"),
    refine: (request) => run(request, "refine"),
    summarize: (request) => run(request, "summarize"),
  };
}

function isOpenRouterHost(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).host === "openrouter.ai";
  } catch {
    return false;
  }
}
