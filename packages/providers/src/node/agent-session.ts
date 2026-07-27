import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { newId } from "@specpasa/core";
import { VENDORED_SKILLS, type AgentSkillName } from "./skills/index.js";

/**
 * Interview/conversion sessions against the locally installed claude CLI via
 * the Claude Agent SDK. Unlike the one-shot local-cli adapter, sessions are
 * interactive: the model's AskUserQuestion calls are intercepted through the
 * SDK's canUseTool permission callback, surfaced as `question` events, and
 * answered asynchronously through `answer()` (raw `claude -p` would block on
 * them). The skill works inside a throwaway workspace directory seeded with
 * the vendored skills and the spec document; the document round-trips through
 * OUTPUT.md.
 */

/** Skills the user starts explicitly in the draft phase. */
export const INTERVIEW_SKILLS = ["grilling", "wayfinder"] as const;
export type InterviewSkillName = (typeof INTERVIEW_SKILLS)[number];

/** Skill that generates the given phase's document from the frozen source. */
export const CONVERSION_SKILLS = {
  prd: "to-spec",
  erd: "to-erd",
  tasks: "to-tickets",
} as const satisfies Record<string, AgentSkillName>;

export interface InterviewQuestionOption {
  label: string;
  description?: string;
}

export interface InterviewQuestion {
  question: string;
  header: string;
  options: InterviewQuestionOption[];
  multiSelect: boolean;
}

/** One intercepted AskUserQuestion call (1-4 questions answered together). */
export interface InterviewQuestionSet {
  id: string;
  questions: InterviewQuestion[];
}

export interface InterviewAnswer {
  /** Must match the question text from the InterviewQuestionSet. */
  question: string;
  /** Chosen option labels, or a single free-text answer. */
  selections: string[];
}

export type InterviewEvent =
  | { type: "token"; text: string }
  | { type: "question"; questionSet: InterviewQuestionSet }
  | { type: "doc-update"; markdown: string }
  | { type: "done"; markdown: string }
  | { type: "error"; message: string };

export interface InterviewSessionOptions {
  skill: AgentSkillName;
  /** Seeds OUTPUT.md (interview skills) or INPUT.md (conversion skills). */
  documentMarkdown: string;
  /** Free-text kickoff appended after the /skill invocation. */
  prompt?: string;
  /** Hard wall-clock cap for the whole session. Default 30 minutes. */
  timeoutMs?: number;
  /** How long to wait for a human answer before erroring. Default 10 minutes. */
  answerTimeoutMs?: number;
}

export interface InterviewSession {
  readonly id: string;
  readonly skill: AgentSkillName;
  /** Single-consumer event stream; ends after `done` or `error`. */
  events(): AsyncIterable<InterviewEvent>;
  /** Resolve a pending question set. Returns false for unknown/stale ids. */
  answer(questionSetId: string, answers: InterviewAnswer[]): boolean;
  /** Abort the session and remove its workspace. Safe to call twice. */
  cancel(): Promise<void>;
}

/**
 * The slice of the Agent SDK the session uses — injectable so tests can
 * script the message stream and drive canUseTool without spawning claude.
 */
export interface AgentSdk {
  query(params: { prompt: string; options: AgentQueryOptions }): AsyncIterable<unknown>;
}

export type PermissionResultLike =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string; interrupt?: boolean };

export interface AgentQueryOptions {
  cwd: string;
  settingSources: ["project"];
  skills: string[];
  allowedTools: string[];
  permissionMode: "default";
  includePartialMessages: boolean;
  maxTurns: number;
  abortController: AbortController;
  canUseTool: (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => Promise<PermissionResultLike>;
}

const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_ANSWER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TURNS = 200;

async function defaultSdk(): Promise<AgentSdk> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  // Our AgentQueryOptions is a structural subset of the SDK's Options.
  return { query: (params) => query(params as never) };
}

/** Single-consumer push queue bridging SDK callbacks to the event iterator. */
class EventQueue<T> {
  private buffer: T[] = [];
  private waiter: ((result: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const buffered = this.buffer.shift();
        if (buffered !== undefined) return Promise.resolve({ value: buffered, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
          this.waiter = resolve;
        });
      },
    };
  }
}

interface PendingAnswer {
  questions: InterviewQuestion[];
  resolve: (answers: InterviewAnswer[]) => void;
  timer: NodeJS.Timeout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrow an SDK stream message to its text delta, if it carries one. */
function textDelta(message: unknown): string | null {
  if (!isRecord(message) || message.type !== "stream_event") return null;
  const event = message.event;
  if (!isRecord(event) || event.type !== "content_block_delta") return null;
  const delta = event.delta;
  if (!isRecord(delta) || delta.type !== "text_delta") return null;
  return typeof delta.text === "string" ? delta.text : null;
}

function resultText(message: unknown): string | null {
  if (!isRecord(message) || message.type !== "result") return null;
  return typeof message.result === "string" ? message.result : null;
}

function parseQuestions(input: Record<string, unknown>): InterviewQuestion[] {
  if (!Array.isArray(input.questions)) return [];
  return input.questions.filter(isRecord).map((q) => ({
    question: typeof q.question === "string" ? q.question : "",
    header: typeof q.header === "string" ? q.header : "",
    multiSelect: q.multiSelect === true,
    options: Array.isArray(q.options)
      ? q.options.filter(isRecord).map((o) => ({
          label: typeof o.label === "string" ? o.label : "",
          description: typeof o.description === "string" ? o.description : undefined,
        }))
      : [],
  }));
}

export function createInterviewSession(
  options: InterviewSessionOptions,
  sdk?: AgentSdk,
): InterviewSession {
  const id = newId();
  const skill = VENDORED_SKILLS[options.skill];
  const isConversion = (Object.values(CONVERSION_SKILLS) as string[]).includes(options.skill);
  const answerTimeoutMs = options.answerTimeoutMs ?? DEFAULT_ANSWER_TIMEOUT_MS;

  const queue = new EventQueue<InterviewEvent>();
  const pending = new Map<string, PendingAnswer>();
  const abort = new AbortController();
  let workspaceDir: string | null = null;
  let lastDocUpdate: string | null = null;
  let finished = false;

  const failPending = () => {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
  };

  const finish = (event: InterviewEvent | null) => {
    if (finished) return;
    finished = true;
    if (event) queue.push(event);
    queue.close();
    failPending();
  };

  const cleanupWorkspace = async () => {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
      workspaceDir = null;
    }
  };

  const insideWorkspace = (path: unknown): boolean => {
    if (typeof path !== "string" || !workspaceDir) return false;
    const resolved = resolve(workspaceDir, path);
    return resolved === workspaceDir || resolved.startsWith(workspaceDir + sep);
  };

  const handleAskUserQuestion = async (
    input: Record<string, unknown>,
  ): Promise<PermissionResultLike> => {
    const questions = parseQuestions(input);
    if (questions.length === 0) {
      return { behavior: "deny", message: "Malformed AskUserQuestion input." };
    }
    const questionSetId = newId();
    const answers = await new Promise<InterviewAnswer[] | null>((resolvePromise) => {
      const timer = setTimeout(() => {
        pending.delete(questionSetId);
        resolvePromise(null);
      }, answerTimeoutMs);
      pending.set(questionSetId, { questions, resolve: resolvePromise, timer });
      queue.push({ type: "question", questionSet: { id: questionSetId, questions } });
    });
    if (answers === null) {
      abort.abort();
      return {
        behavior: "deny",
        message: "The user did not answer in time — the session was cancelled.",
        interrupt: true,
      };
    }
    // The SDK's AskUserQuestion contract: answers keyed by question text,
    // multi-select selections comma-separated.
    const byQuestion: Record<string, string> = {};
    for (const answer of answers) byQuestion[answer.question] = answer.selections.join(", ");
    return { behavior: "allow", updatedInput: { ...input, answers: byQuestion } };
  };

  const handleWrite = (input: Record<string, unknown>): PermissionResultLike => {
    if (!insideWorkspace(input.file_path)) {
      return { behavior: "deny", message: "Only files inside the session workspace." };
    }
    const path = resolve(workspaceDir!, input.file_path as string);
    if (path === join(workspaceDir!, "OUTPUT.md") && typeof input.content === "string") {
      lastDocUpdate = input.content;
      queue.push({ type: "doc-update", markdown: input.content });
    }
    return { behavior: "allow" };
  };

  const READ_TOOLS = new Set(["Read", "Glob", "Grep"]);
  const FREE_TOOLS = new Set(["Skill", "TodoWrite"]);

  const canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResultLike> => {
    if (toolName === "AskUserQuestion") return handleAskUserQuestion(input);
    if (toolName === "Write") return handleWrite(input);
    if (FREE_TOOLS.has(toolName)) return { behavior: "allow" };
    if (READ_TOOLS.has(toolName)) {
      return insideWorkspace(input.file_path ?? input.path ?? workspaceDir)
        ? { behavior: "allow" }
        : { behavior: "deny", message: "Only files inside the session workspace." };
    }
    if (toolName === "Edit") {
      return {
        behavior: "deny",
        message: "Rewrite the file in full with the Write tool instead of editing it.",
      };
    }
    return { behavior: "deny", message: `The ${toolName} tool is not available in this session.` };
  };

  const prepareWorkspace = async (): Promise<string> => {
    workspaceDir = await mkdtemp(join(tmpdir(), "specpasa-agent-"));
    for (const file of skill.files) {
      const target = join(workspaceDir, ".claude", "skills", skill.name, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    const seedFile = isConversion ? "INPUT.md" : "OUTPUT.md";
    await writeFile(join(workspaceDir, seedFile), options.documentMarkdown, "utf8");

    const workspaceNote = isConversion
      ? "The frozen source document is INPUT.md. Write the result to OUTPUT.md."
      : "The current draft is OUTPUT.md.";
    return [`/${skill.name}`, options.prompt?.trim(), workspaceNote].filter(Boolean).join("\n\n");
  };

  const run = async (): Promise<InterviewEvent> => {
    const prompt = await prepareWorkspace();
    const cwd = workspaceDir!;
    const impl = sdk ?? (await defaultSdk());
    const stream = impl.query({
      prompt,
      options: {
        cwd,
        settingSources: ["project"],
        skills: [skill.name],
        allowedTools: [],
        permissionMode: "default",
        includePartialMessages: true,
        maxTurns: MAX_TURNS,
        abortController: abort,
        canUseTool,
      },
    });

    let finalText: string | null = null;
    for await (const message of stream) {
      const token = textDelta(message);
      if (token !== null) queue.push({ type: "token", text: token });
      finalText = resultText(message) ?? finalText;
    }

    // OUTPUT.md on disk is the source of truth; fall back to the content of
    // the last intercepted Write, then to the final assistant text.
    const markdown =
      (await readFile(join(cwd, "OUTPUT.md"), "utf8").catch(() => null)) ??
      lastDocUpdate ??
      finalText;
    if (!markdown?.trim()) throw new Error("The session produced no document.");
    return { type: "done", markdown };
  };

  const timeout = setTimeout(() => {
    abort.abort();
    finish({ type: "error", message: "Session timed out." });
  }, options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS);

  void (async () => {
    let final: InterviewEvent | null = null;
    try {
      final = await run();
    } catch (error: unknown) {
      if (!finished && !abort.signal.aborted) {
        final = { type: "error", message: error instanceof Error ? error.message : String(error) };
      }
    } finally {
      clearTimeout(timeout);
      // Cleanup before the final event so consumers never observe a live
      // workspace after `done`.
      await cleanupWorkspace();
      finish(final);
    }
  })();

  return {
    id,
    skill: options.skill,
    events: () => queue,
    answer: (questionSetId, answers) => {
      const entry = pending.get(questionSetId);
      if (!entry) return false;
      pending.delete(questionSetId);
      clearTimeout(entry.timer);
      entry.resolve(answers);
      return true;
    },
    cancel: async () => {
      abort.abort();
      finish(null);
      await cleanupWorkspace();
    },
  };
}
