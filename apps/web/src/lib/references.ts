import { assertNever, blocksToMarkdown } from "@specpasa/core";
import { type AgentContextItem } from "@specpasa/providers";
import { getDb, schema, eq } from "./db";

/** Cap per reference so a big page can't crowd out the spec itself. */
const MAX_CONTENT_CHARS = 8_000;
const FETCH_TIMEOUT_MS = 5_000;

type SpecReference = typeof schema.spec_references.$inferSelect;

function clamp(text: string): string {
  return text.length > MAX_CONTENT_CHARS
    ? `${text.slice(0, MAX_CONTENT_CHARS)}\n…[truncated]`
    : text;
}

/** Crude but dependency-free: strip tags/scripts when a URL returns HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** github.com/owner/repo/blob/ref/path → raw.githubusercontent.com equivalent. */
function toRawGithubUrl(url: string): string {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url);
  return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}` : url;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "text/html, text/plain, text/*, application/json" },
  });
  if (!response.ok) throw new Error(`fetch failed (${response.status})`);
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  return clamp(contentType.includes("html") ? htmlToText(body) : body);
}

async function specMarkdown(specId: string): Promise<string> {
  const db = getDb();
  const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, specId));
  if (!spec?.current_version_id) throw new Error("referenced spec has no versions");
  const [version] = await db
    .select()
    .from(schema.spec_versions)
    .where(eq(schema.spec_versions.id, spec.current_version_id));
  if (!version) throw new Error("referenced spec version missing");
  return clamp(blocksToMarkdown(version.blocks));
}

async function resolveOne(reference: SpecReference): Promise<AgentContextItem> {
  const kind = reference.kind;
  switch (kind) {
    case "url":
      return { kind, title: reference.title, content: await fetchText(reference.url!) };
    case "github_code":
      return {
        kind,
        title: reference.title,
        content: await fetchText(toRawGithubUrl(reference.url!)),
      };
    case "spec": {
      const specId = (reference.payload as { spec_id?: string } | null)?.spec_id;
      if (!specId) throw new Error("spec reference missing spec_id");
      return { kind, title: reference.title, content: await specMarkdown(specId) };
    }
    case "file":
      throw new Error("file references are not supported yet");
    default:
      return assertNever(kind, "ReferenceKind");
  }
}

/**
 * Resolve a spec's references into AI context (FR-REF-3, FR-AI-8). A failing
 * reference degrades to a note instead of blocking the draft — the model is
 * told the reference exists but couldn't be loaded.
 */
export async function resolveReferences(specId: string): Promise<AgentContextItem[]> {
  const references = await getDb()
    .select()
    .from(schema.spec_references)
    .where(eq(schema.spec_references.spec_id, specId));
  return Promise.all(
    references.map(async (reference) => {
      try {
        return await resolveOne(reference);
      } catch (error) {
        return {
          kind: reference.kind === "file" ? "url" : reference.kind,
          title: reference.title,
          content: `[reference could not be loaded: ${error instanceof Error ? error.message : String(error)}]`,
        } satisfies AgentContextItem;
      }
    }),
  );
}
