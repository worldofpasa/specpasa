import { type IntegrationKind } from "@specpasa/core";

/**
 * Integration sink interface (ADR-7): one adapter per external tool, two
 * capabilities — export a document, create tasks. Inputs and outputs are
 * plain data, deliberately the shape of an MCP tool, so each sink can later
 * be exposed as a standalone MCP server without rework.
 */

export interface DocumentExportInput {
  title: string;
  markdown: string;
  /** Stable identity used for idempotent re-export (file path derivation). */
  specId: string;
  versionNumber: number;
  /** Previously recorded target path — reused verbatim on re-export so the
   * document stays at one path across title renames. */
  path?: string | null;
}

export interface TaskExportTask {
  taskId: string;
  title: string;
  description: string | null;
}

export interface TaskExportEpic {
  epicId: string;
  title: string;
  description: string | null;
  tasks: TaskExportTask[];
  /** Existing external id (e.g. GitHub issue number) → update, not create. */
  priorExternalId: string | null;
}

export interface TasksExportInput {
  specTitle: string;
  epics: TaskExportEpic[];
}

/** Mirrors export_records: what landed where. */
export interface ExternalRecord {
  kind: "document" | "issue";
  /** Internal id this record maps to: specId for documents, epicId for issues. */
  internalId: string;
  externalId: string;
  externalUrl: string | null;
}

export interface IntegrationSink {
  readonly kind: IntegrationKind;
  exportDocument?(input: DocumentExportInput): Promise<ExternalRecord[]>;
  createTasks?(input: TasksExportInput): Promise<ExternalRecord[]>;
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
