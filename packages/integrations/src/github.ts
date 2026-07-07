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

async function ghFetch<T>(config: GitHubSinkConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "specpasa",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new IntegrationError(
      `GitHub API ${init?.method ?? "GET"} ${path} failed (${response.status}): ${detail.slice(0, 200)}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

function documentPath(config: GitHubSinkConfig, input: DocumentExportInput): string {
  const dir = (config.basePath ?? "specs").replace(/^\/+|\/+$/g, "");
  return `${dir ? `${dir}/` : ""}${slugifyTitle(input.title)}.md`;
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

  return {
    kind: "github",

    async exportDocument(input: DocumentExportInput): Promise<ExternalRecord[]> {
      const path = documentPath(config, input);
      const ref = config.branch ? `?ref=${encodeURIComponent(config.branch)}` : "";
      // Existing file → include its sha so the API updates instead of failing.
      let sha: string | undefined;
      try {
        const existing = await ghFetch<{ sha: string }>(config, `${repoPath}/contents/${path}${ref}`);
        sha = existing.sha;
      } catch (error) {
        if (!(error instanceof IntegrationError) || error.status !== 404) throw error;
      }
      const result = await ghFetch<{ content: { html_url: string | null } }>(
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
