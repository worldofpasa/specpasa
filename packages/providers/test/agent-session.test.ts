import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createInterviewSession,
  type AgentQueryOptions,
  type AgentSdk,
  type InterviewEvent,
  type PermissionResultLike,
} from "../src/node/agent-session.js";

const QUESTION_INPUT = {
  questions: [
    {
      question: "Which storage should we use?",
      header: "Storage",
      multiSelect: false,
      options: [
        { label: "SQLite (Recommended)", description: "Zero-ops local file" },
        { label: "Postgres", description: "Client/server" },
      ],
    },
  ],
};

/** Fake SDK whose generator scripts tool calls through the real canUseTool. */
function fakeSdk(
  script: (
    canUseTool: AgentQueryOptions["canUseTool"],
    options: AgentQueryOptions,
  ) => AsyncGenerator<unknown>,
): AgentSdk & { capturedOptions: () => AgentQueryOptions } {
  let captured: AgentQueryOptions | null = null;
  return {
    query: ({ options }) => {
      captured = options;
      return script(options.canUseTool, options);
    },
    capturedOptions: () => captured!,
  };
}

async function collect(events: AsyncIterable<InterviewEvent>): Promise<InterviewEvent[]> {
  const all: InterviewEvent[] = [];
  for (const _ of []) void _;
  for await (const event of events) all.push(event);
  return all;
}

const token = (text: string) => ({
  type: "stream_event",
  event: { type: "content_block_delta", delta: { type: "text_delta", text } },
});

describe("createInterviewSession", () => {
  it("round-trips an AskUserQuestion through question event and answer()", async () => {
    let receivedAnswers: Record<string, string> | undefined;
    const sdk = fakeSdk(async function* (canUseTool, options) {
      yield token("thinking…");
      const result = await canUseTool("AskUserQuestion", QUESTION_INPUT, {
        signal: new AbortController().signal,
      });
      expect(result.behavior).toBe("allow");
      receivedAnswers = (result as { updatedInput?: { answers?: Record<string, string> } })
        .updatedInput?.answers;
      const write = await canUseTool(
        "Write",
        { file_path: "OUTPUT.md", content: "# Sharpened" },
        { signal: new AbortController().signal },
      );
      if (write.behavior === "allow") {
        // Mirror the real CLI: an allowed Write persists to the workspace.
        const { writeFile } = await import("node:fs/promises");
        await writeFile(`${options.cwd}/OUTPUT.md`, "# Sharpened", "utf8");
      }
      yield write;
    });

    const session = createInterviewSession(
      { skill: "grilling", documentMarkdown: "# Rough idea" },
      sdk,
    );

    const events: InterviewEvent[] = [];
    for await (const event of session.events()) {
      events.push(event);
      if (event.type === "question") {
        expect(event.questionSet.questions[0]!.header).toBe("Storage");
        expect(event.questionSet.questions[0]!.options).toHaveLength(2);
        const ok = session.answer(event.questionSet.id, [
          { question: "Which storage should we use?", selections: ["SQLite (Recommended)"] },
        ]);
        expect(ok).toBe(true);
      }
    }

    expect(receivedAnswers).toEqual({
      "Which storage should we use?": "SQLite (Recommended)",
    });
    expect(events.map((e) => e.type)).toEqual(["token", "question", "doc-update", "done"]);
    const done = events.at(-1) as { type: "done"; markdown: string };
    expect(done.markdown).toBe("# Sharpened");
  });

  it("answers multi-select questions comma-separated", async () => {
    let received: Record<string, string> | undefined;
    const sdk = fakeSdk(async function* (canUseTool) {
      const input = {
        questions: [
          {
            question: "Which exports?",
            header: "Exports",
            multiSelect: true,
            options: [
              { label: "GitHub", description: "" },
              { label: "Linear", description: "" },
            ],
          },
        ],
      };
      const result = await canUseTool("AskUserQuestion", input, {
        signal: new AbortController().signal,
      });
      received = (result as { updatedInput?: { answers?: Record<string, string> } }).updatedInput
        ?.answers;
      yield token("done");
    });

    const session = createInterviewSession({ skill: "grilling", documentMarkdown: "seed" }, sdk);
    for await (const event of session.events()) {
      if (event.type === "question") {
        session.answer(event.questionSet.id, [
          { question: "Which exports?", selections: ["GitHub", "Linear"] },
        ]);
      }
    }
    expect(received).toEqual({ "Which exports?": "GitHub, Linear" });
  });

  it("denies writes escaping the workspace and non-workspace tools", async () => {
    const verdicts: PermissionResultLike[] = [];
    const sdk = fakeSdk(async function* (canUseTool) {
      const signal = new AbortController().signal;
      verdicts.push(
        await canUseTool("Write", { file_path: "/etc/passwd", content: "x" }, { signal }),
      );
      verdicts.push(
        await canUseTool("Write", { file_path: "../escape.md", content: "x" }, { signal }),
      );
      verdicts.push(await canUseTool("Bash", { command: "rm -rf /" }, { signal }));
      verdicts.push(await canUseTool("Edit", { file_path: "OUTPUT.md" }, { signal }));
      verdicts.push(
        await canUseTool("Write", { file_path: "OUTPUT.md", content: "ok" }, { signal }),
      );
      yield token("x");
    });

    const session = createInterviewSession({ skill: "grilling", documentMarkdown: "seed" }, sdk);
    await collect(session.events());

    expect(verdicts.map((v) => v.behavior)).toEqual(["deny", "deny", "deny", "deny", "allow"]);
  });

  it("seeds INPUT.md for conversion skills and OUTPUT.md for interviews", async () => {
    let interviewCwd = "";
    const interviewSdk = fakeSdk(async function* (_canUseTool, options) {
      interviewCwd = options.cwd;
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(`${options.cwd}/OUTPUT.md`, "utf8")).toBe("# Idea");
      expect(await readFile(`${options.cwd}/.claude/skills/grilling/SKILL.md`, "utf8")).toContain(
        "name: grilling",
      );
      yield token("x");
    });
    await collect(
      createInterviewSession(
        { skill: "grilling", documentMarkdown: "# Idea" },
        interviewSdk,
      ).events(),
    );
    // Workspace is removed once the session ends.
    await expect(access(interviewCwd)).rejects.toThrow();

    const conversionSdk = fakeSdk(async function* (canUseTool, options) {
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(`${options.cwd}/INPUT.md`, "utf8")).toBe("# Frozen PRD");
      await canUseTool(
        "Write",
        { file_path: "OUTPUT.md", content: "# ERD" },
        { signal: new AbortController().signal },
      );
      yield token("x");
    });
    const events = await collect(
      createInterviewSession(
        { skill: "to-erd", documentMarkdown: "# Frozen PRD" },
        conversionSdk,
      ).events(),
    );
    const done = events.at(-1) as { type: "done"; markdown: string };
    expect(done.markdown).toBe("# ERD");
  });

  it("invokes the skill by slash name with project-only settings", async () => {
    const sdk = fakeSdk(async function* () {
      yield token("x");
    });
    let prompt = "";
    const capture: AgentSdk = {
      query: (params) => {
        prompt = params.prompt;
        return sdk.query(params);
      },
    };
    await collect(
      createInterviewSession(
        { skill: "wayfinder", documentMarkdown: "seed", prompt: "A mobile app for plant care" },
        capture,
      ).events(),
    );
    expect(prompt.startsWith("/wayfinder")).toBe(true);
    expect(prompt).toContain("A mobile app for plant care");
    const options = sdk.capturedOptions();
    expect(options.settingSources).toEqual(["project"]);
    expect(options.skills).toEqual(["wayfinder"]);
  });

  it("errors the session when an answer times out", async () => {
    // eslint-disable-next-line require-yield -- the fake aborts before producing messages
    const sdk = fakeSdk(async function* (canUseTool) {
      const result = await canUseTool("AskUserQuestion", QUESTION_INPUT, {
        signal: new AbortController().signal,
      });
      expect(result.behavior).toBe("deny");
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const session = createInterviewSession(
      { skill: "grilling", documentMarkdown: "seed", answerTimeoutMs: 20 },
      sdk,
    );
    const events = await collect(session.events());
    // The question surfaced, was never answered, and the session ended
    // without a done event.
    expect(events.some((e) => e.type === "question")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(false);
  });

  it("cancel() aborts, closes the stream, and answers become stale", async () => {
    const sdk = fakeSdk(async function* (canUseTool) {
      await canUseTool("AskUserQuestion", QUESTION_INPUT, {
        signal: new AbortController().signal,
      });
      yield token("never");
    });
    const session = createInterviewSession({ skill: "grilling", documentMarkdown: "seed" }, sdk);
    const iterator = session.events()[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect((first.value as InterviewEvent).type).toBe("question");
    await session.cancel();
    const rest = await iterator.next();
    expect(rest.done).toBe(true);
    const questionSet = (first.value as { questionSet: { id: string } }).questionSet;
    expect(session.answer(questionSet.id, [])).toBe(false);
  });
});
