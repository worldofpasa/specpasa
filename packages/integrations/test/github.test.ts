import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHubSink, slugifyTitle } from "../src/github.js";
import { IntegrationError } from "../src/types.js";

const config = { owner: "acme", repo: "specs", branch: "main", basePath: "specs", token: "t" };

function mockFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status });
  });
  vi.stubGlobal("fetch", impl);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("slugifyTitle", () => {
  it("slugifies and never returns empty", () => {
    expect(slugifyTitle("Self-serve Onboarding — PRD!")).toBe("self-serve-onboarding-prd");
    expect(slugifyTitle("???")).toBe("untitled");
  });
});

describe("exportDocument", () => {
  it("creates a new file when none exists (404 → PUT without sha)", async () => {
    const calls = mockFetch([
      { status: 404, body: {} },
      {
        status: 201,
        body: { content: { html_url: "https://github.com/acme/specs/blob/main/specs/x.md" } },
      },
    ]);
    const [record] = await createGitHubSink(config).exportDocument!({
      title: "X",
      markdown: "# X",
      specId: "spec1",
      versionNumber: 3,
    });
    const put = JSON.parse(String(calls[1]!.init!.body));
    expect(put.sha).toBeUndefined();
    expect(put.branch).toBe("main");
    expect(record!.kind).toBe("document");
    expect(record!.externalId).toBe("specs/x-spec1.md");
  });

  it("updates in place when the file exists (sha included → idempotent)", async () => {
    const calls = mockFetch([
      { status: 200, body: { sha: "abc123" } },
      { status: 200, body: { content: { html_url: "u" } } },
    ]);
    await createGitHubSink(config).exportDocument!({
      title: "X",
      markdown: "# X v2",
      specId: "spec1",
      versionNumber: 4,
    });
    expect(JSON.parse(String(calls[1]!.init!.body)).sha).toBe("abc123");
  });

  it("round-trips unicode content through base64", async () => {
    const calls = mockFetch([
      { status: 404, body: {} },
      { status: 201, body: { content: { html_url: "u" } } },
    ]);
    await createGitHubSink(config).exportDocument!({
      title: "U",
      markdown: "naïve — ✓ 五分",
      specId: "s",
      versionNumber: 1,
    });
    const b64 = JSON.parse(String(calls[1]!.init!.body)).content as string;
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    expect(decoded).toBe("naïve — ✓ 五分");
  });

  it("propagates non-404 API errors", async () => {
    mockFetch([{ status: 401, body: { message: "Bad credentials" } }]);
    await expect(
      createGitHubSink(config).exportDocument!({
        title: "X",
        markdown: "x",
        specId: "s",
        versionNumber: 1,
      }),
    ).rejects.toThrow(IntegrationError);
  });
});

describe("createTasks", () => {
  const epic = {
    epicId: "e1",
    title: "Signup flow",
    description: "Fast signup",
    tasks: [{ taskId: "t1", title: "Email form", description: "with validation" }],
  };

  it("creates an issue per epic with a task checklist", async () => {
    const calls = mockFetch([{ status: 201, body: { number: 7, html_url: "https://x/7" } }]);
    const records = await createGitHubSink(config).createTasks!({
      specTitle: "Onboarding",
      epics: [{ ...epic, priorExternalId: null }],
    });
    expect(calls[0]!.init!.method).toBe("POST");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.body).toContain("- [ ] **Email form** — with validation");
    expect(records[0]).toMatchObject({ kind: "issue", internalId: "e1", externalId: "7" });
  });

  it("patches the existing issue on re-export (idempotency)", async () => {
    const calls = mockFetch([{ status: 200, body: { number: 7, html_url: "https://x/7" } }]);
    await createGitHubSink(config).createTasks!({
      specTitle: "Onboarding",
      epics: [{ ...epic, priorExternalId: "7" }],
    });
    expect(calls[0]!.url).toContain("/issues/7");
    expect(calls[0]!.init!.method).toBe("PATCH");
  });
});

describe("review fixes", () => {
  it("derives distinct paths for same-titled specs (id suffix)", async () => {
    const calls = mockFetch([
      { status: 404, body: {} },
      { status: 201, body: { content: { html_url: "u" } } },
    ]);
    const [record] = await createGitHubSink(config).exportDocument!({
      title: "X",
      markdown: "x",
      specId: "01ABCDEF",
      versionNumber: 1,
    });
    expect(record!.externalId).toBe("specs/x-abcdef.md");
    expect(calls[0]!.url).toContain("specs/x-abcdef.md");
  });

  it("reuses the recorded path verbatim on re-export (rename-safe)", async () => {
    const calls = mockFetch([
      { status: 200, body: { sha: "s" } },
      { status: 200, body: { content: { html_url: "u" } } },
    ]);
    const [record] = await createGitHubSink(config).exportDocument!({
      title: "Renamed Title",
      markdown: "x",
      specId: "01ABCDEF",
      versionNumber: 2,
      path: "specs/original-abcdef.md",
    });
    expect(record!.externalId).toBe("specs/original-abcdef.md");
    expect(calls[0]!.url).toContain("specs/original-abcdef.md");
  });

  it("retries once on a 409 sha conflict and converges", async () => {
    const calls = mockFetch([
      { status: 200, body: { sha: "old" } },
      { status: 409, body: { message: "is at abc but expected old" } },
      { status: 200, body: { sha: "new" } },
      { status: 200, body: { content: { html_url: "u" } } },
    ]);
    await createGitHubSink(config).exportDocument!({
      title: "X",
      markdown: "x",
      specId: "s",
      versionNumber: 1,
    });
    expect(calls).toHaveLength(4);
    expect(JSON.parse(String(calls[3]!.init!.body)).sha).toBe("new");
  });

  it("bounds every request with an abort signal", async () => {
    const calls = mockFetch([
      { status: 404, body: {} },
      { status: 201, body: { content: { html_url: "u" } } },
    ]);
    await createGitHubSink(config).exportDocument!({
      title: "X",
      markdown: "x",
      specId: "s",
      versionNumber: 1,
    });
    for (const call of calls) expect(call.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
