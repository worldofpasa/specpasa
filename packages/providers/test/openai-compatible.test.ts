import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleAgent } from "../src/openai-compatible.js";
import { type AgentEvent, type AgentRequest } from "../src/types.js";

const request: AgentRequest = { prompt: "Write the spec", phase: "prd" };

function sseBody(...events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
}

function chunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOpenAiCompatibleAgent", () => {
  it("streams tokens and finishes with parsed blocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(sseBody(chunk("# Title"), chunk("\n\nBody"), "data: [DONE]\n\n")),
      ),
    );
    const agent = createOpenAiCompatibleAgent({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-test",
    });
    const events = await collect(agent.draft(request));
    const tokens = events.filter((event) => event.type === "token");
    expect(tokens.map((event) => (event.type === "token" ? event.text : ""))).toEqual([
      "# Title",
      "\n\nBody",
    ]);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") expect(done.blocks.length).toBeGreaterThan(0);
  });

  it("posts to /chat/completions with a Bearer header only when a key is set", async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody(chunk("x"), "data: [DONE]\n\n")));
    vi.stubGlobal("fetch", fetchMock);
    const keyed = createOpenAiCompatibleAgent({
      baseUrl: "https://api.example.com/v1/",
      apiKey: "sk-test",
      model: "m",
    });
    await collect(keyed.draft(request));
    const [url, keyedInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect((keyedInit.headers as Record<string, string>).authorization).toBe("Bearer sk-test");

    const keyless = createOpenAiCompatibleAgent({
      baseUrl: "http://localhost:1234/v1",
      model: "m",
    });
    await collect(keyless.draft(request));
    const [, keylessInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((keylessInit.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("tags OpenRouter requests with an app title header", async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody(chunk("x"), "data: [DONE]\n\n")));
    vi.stubGlobal("fetch", fetchMock);
    const agent = createOpenAiCompatibleAgent({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "k",
      model: "some/model",
    });
    await collect(agent.draft(request));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-title"]).toBe("specpasa");
  });

  it("ignores keep-alive comments and tolerates malformed data lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            sseBody(": keep-alive\n\n", "data: {not json}\n\n", chunk("ok"), "data: [DONE]\n\n"),
          ),
      ),
    );
    const agent = createOpenAiCompatibleAgent({ baseUrl: "https://x.test/v1", model: "m" });
    const events = await collect(agent.draft(request));
    expect(events.filter((event) => event.type === "token")).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("surfaces the response body on a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":{"message":"invalid model"}}', { status: 404 })),
    );
    const agent = createOpenAiCompatibleAgent({ baseUrl: "https://x.test/v1", model: "bad" });
    const events = await collect(agent.draft(request));
    expect(events).toHaveLength(1);
    const [error] = events;
    expect(error.type).toBe("error");
    if (error.type === "error") {
      expect(error.message).toContain("404");
      expect(error.message).toContain("invalid model");
    }
  });

  it("surfaces mid-stream error objects and stops", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            sseBody(
              chunk("partial"),
              `data: ${JSON.stringify({ error: { message: "quota" } })}\n\n`,
            ),
          ),
      ),
    );
    const agent = createOpenAiCompatibleAgent({ baseUrl: "https://x.test/v1", model: "m" });
    const events = await collect(agent.draft(request));
    const last = events.at(-1);
    expect(last?.type).toBe("error");
    if (last?.type === "error") expect(last.message).toBe("quota");
  });

  it("reports an empty stream as an error, not an empty done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sseBody("data: [DONE]\n\n"))),
    );
    const agent = createOpenAiCompatibleAgent({ baseUrl: "https://x.test/v1", model: "m" });
    const events = await collect(agent.draft(request));
    expect(events.at(-1)?.type).toBe("error");
  });
});
