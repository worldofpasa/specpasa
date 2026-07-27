import type { InterviewSession } from "@specpasa/providers/node";

/**
 * In-memory registry for live interview/conversion sessions. specpasa's
 * default deploy is a single Node process (ADR-2), so a module-level Map is
 * the whole registry; sessions do not survive a server restart (the working
 * draft buffer bounds the loss) and this is incompatible with multi-node —
 * a documented v1 limitation.
 */

export interface RegisteredSession {
  session: InterviewSession;
  /** Only the user who started a session may answer or cancel it. */
  userId: string;
  specId: string;
  startedAt: number;
}

const sessions = new Map<string, RegisteredSession>();

/** Safety margin above the session's own 30-minute hard timeout. */
const STALE_AFTER_MS = 45 * 60 * 1000;
let sweeper: NodeJS.Timeout | null = null;

function sweep(): void {
  const cutoff = Date.now() - STALE_AFTER_MS;
  for (const [id, entry] of sessions) {
    if (entry.startedAt < cutoff) {
      void entry.session.cancel();
      sessions.delete(id);
    }
  }
  if (sessions.size === 0 && sweeper) {
    clearInterval(sweeper);
    sweeper = null;
  }
}

export function registerSession(entry: RegisteredSession): void {
  sessions.set(entry.session.id, entry);
  sweeper ??= setInterval(sweep, 60_000).unref() as unknown as NodeJS.Timeout;
}

export function getSessionFor(sessionId: string, userId: string): RegisteredSession | null {
  const entry = sessions.get(sessionId);
  return entry && entry.userId === userId ? entry : null;
}

export function releaseSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** One live session per spec — a second interview would race the buffer. */
export function hasActiveSessionForSpec(specId: string): boolean {
  return [...sessions.values()].some((entry) => entry.specId === specId);
}
