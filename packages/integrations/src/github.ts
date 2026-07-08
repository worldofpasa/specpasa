import {
  IntegrationError,
  type DocumentExportInput,
  type ExternalRecord,
  type IntegrationSink,
  type TaskExportEpic,
  type TasksExportInput,
} from "./types.js";

/**
 * GitHub sink over the REST API with plain fetch — no octokit, so the root
 * export stays importable on Cloudflare Workers (ADR-2). Documents are
 * committed via the contents API (idempotent by file path); epics become
 * issues with a task checklist (updated in place when re-exported).
 */

export interface GitHubSinkConfig {
  owner: string;
  repo: string;
  /** Branch to commit documents to; omit for the repo default branch. */
  branch?: string;
  /** Directory prefix for exported documents. */
  basePath?: string;
  /** Decrypted PAT — never stored here, callers decrypt at the boundary. */
  token: string;
}

const API = "https://api.github.com";

export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/** Unicode-safe base64 for the contents API (btoa exists on Node and Workers). */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Bound every GitHub call so a stalled request can't pin an action. */
const REQUEST_TIMEOUT_MS = 15_000;

async function ghFetch<T>(config: GitHubSinkConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "specpasa",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    // GitHub error bodies are small bounded JSON; read fully, slice for display.
    const detail = await response.text().catch(() => "");
    throw new IntegrationError(
      `GitHub API ${init?.method ?? "GET"} ${path} failed (${response.status}): ${detail.slice(0, 200)}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/**
 * Stable per-spec path: slug + a short spec-id suffix, so two specs with the
 * same title never overwrite each other. Callers pass the previously
 * recorded path on re-export (`input.path`), so renaming a spec keeps
 * updating the SAME file instead of orphaning it.
 */
function documentPath(config: GitHubSinkConfig, input: DocumentExportInput): string {
  if (input.path) return input.path;
  const dir = (config.basePath ?? "specs").replace(/^\/+|\/+$/g, "");
  const suffix = input.specId.slice(-6).toLowerCase();
  return `${dir ? `${dir}/` : ""}${slugifyTitle(input.title)}-${suffix}.md`;
}

function epicIssueBody(specTitle: string, epic: TaskExportEpic): string {
  const lines: string[] = [];
  if (epic.description) lines.push(epic.description, "");
  if (epic.tasks.length) {
    lines.push("### Tasks", "");
    for (const task of epic.tasks) {
      lines.push(`- [ ] **${task.title}**${task.description ? ` — ${task.description}` : ""}`);
    }
    lines.push("");
  }
  lines.push("---", `_Exported from specpasa spec: **${specTitle}**_`);
  return lines.join("\n");
}

export function createGitHubSink(config: GitHubSinkConfig): IntegrationSink {
  const repoPath = `/repos/${config.owner}/${config.repo}`;

  // Existing file → its sha is required so the API updates instead of failing.
  async function getFileSha(path: string): Promise<string | undefined> {
    const ref = config.branch ? `?ref=${encodeURIComponent(config.branch)}` : "";
    try {
      const existing = await ghFetch<{ sha: string }>(config, `${repoPath}/contents/${path}${ref}`);
      return existing.sha;
    } catch (error) {
      if (error instanceof IntegrationError && error.status === 404) return undefined;
      throw error;
    }
  }

  function putFile(path: string, input: DocumentExportInput, sha: string | undefined) {
    return ghFetch<{ content: { html_url: string | null } }>(
      config,
      `${repoPath}/contents/${path}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `spec: ${input.title} (v${input.versionNumber}) via specpasa`,
          content: toBase64(input.markdown),
          ...(config.branch ? { branch: config.branch } : {}),
          ...(sha ? { sha } : {}),
        }),
      },
    );
  }

  return {
    kind: "github",

    async exportDocument(input: DocumentExportInput): Promise<ExternalRecord[]> {
      const path = documentPath(config, input);
      let result;
      try {
        result = await putFile(path, input, await getFileSha(path));
      } catch (error) {
        // Concurrent write moved the sha under us → converge: re-read, retry once.
        if (!(error instanceof IntegrationError) || error.status !== 409) throw error;
        result = await putFile(path, input, await getFileSha(path));
      }
      return [
        {
          kind: "document",
          internalId: input.specId,
          externalId: path,
          externalUrl: result.content?.html_url ?? null,
        },
      ];
    },

    async createTasks(input: TasksExportInput): Promise<ExternalRecord[]> {
      const records: ExternalRecord[] = [];
      for (const epic of input.epics) {
        const payload = JSON.stringify({
          title: epic.title,
          body: epicIssueBody(input.specTitle, epic),
        });
        const issue = epic.priorExternalId
          ? await ghFetch<{ number: number; html_url: string }>(
              config,
              `${repoPath}/issues/${epic.priorExternalId}`,
              { method: "PATCH", body: payload },
            )
          : await ghFetch<{ number: number; html_url: string }>(config, `${repoPath}/issues`, {
              method: "POST",
              body: payload,
            });
        records.push({
          kind: "issue",
          internalId: epic.epicId,
          externalId: String(issue.number),
          externalUrl: issue.html_url,
        });
      }
      return records;
    },
  };
}
