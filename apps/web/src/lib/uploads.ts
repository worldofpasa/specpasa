/**
 * File-reference storage (FR-REF `file` kind, #24). Uploads live in an
 * `uploads/` directory next to the SQLite database file (or `./data/uploads`
 * on non-file DATABASE_URLs). Node-only by design — the optional Workers
 * target doesn't support file references yet (ADR-2).
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATABASE_URL } from "astro:env/server";
import { newId } from "@specpasa/core";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Allowed upload types (#27): documents, images, and text-like data files.
 * SVG is deliberately excluded — inline same-origin serving would make an
 * uploaded SVG a stored-XSS vector.
 */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
] as const;

/** For the file input's `accept` attribute — mirrors the server allowlist. */
export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.join(",");

export function isAllowedUpload(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export interface FilePayload {
  file_name: string;
  mime: string;
  size: number;
  /** Opaque storage key (basename inside the uploads dir). */
  storage_key: string;
}

function uploadsDir(): string {
  const fileUrl = /^file:(.+)$/.exec(DATABASE_URL);
  const base = fileUrl ? path.dirname(path.resolve(fileUrl[1]!)) : path.resolve("data");
  return path.join(base, "uploads");
}

export async function saveUpload(file: File): Promise<FilePayload> {
  const extension = path.extname(file.name).slice(0, 12);
  const storageKey = `${newId()}${extension}`;
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storageKey), Buffer.from(await file.arrayBuffer()));
  return {
    file_name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    storage_key: storageKey,
  };
}

export async function readUpload(payload: FilePayload): Promise<Buffer> {
  // basename() forecloses traversal even if a payload row was tampered with.
  return readFile(path.join(uploadsDir(), path.basename(payload.storage_key)));
}

export async function deleteUpload(payload: FilePayload): Promise<void> {
  try {
    await unlink(path.join(uploadsDir(), path.basename(payload.storage_key)));
  } catch {
    // Already gone — deleting the reference row is what matters.
  }
}

export function isTextLike(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    ["application/json", "application/xml", "application/x-yaml"].includes(mime)
  );
}
