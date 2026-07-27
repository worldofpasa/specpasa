import { getDb, schema, eq } from "./db";
import { provisionOwner } from "./provision";
import { t } from "./strings";
import type { SessionUser } from "./auth";

/**
 * Trusted local mode (desktop shell): the server is bound to 127.0.0.1 on a
 * single-user machine, where a password gates nothing — whoever is at the
 * keyboard already owns the SQLite file. The Tauri shell sets
 * SPECPASA_LOCAL_AUTOLOGIN=1 when spawning the LOCAL server (never for
 * remote/self-hosted mode, never in Docker), and the middleware signs
 * requests in automatically: as the existing owner when the instance has
 * exactly one user, or by provisioning a passwordless owner from the OS
 * username on first run. Instances with multiple users (e.g. a database
 * copied from a shared deployment) fall back to the normal login page.
 */
export function localAutologinEnabled(): boolean {
  return typeof process !== "undefined" && process.env?.SPECPASA_LOCAL_AUTOLOGIN === "1";
}

interface SessionContext {
  session?: { set(key: string, value: unknown): Promise<void> | void } | undefined;
}

/** Serializes first-run provisioning so parallel requests can't double-create. */
let pending: Promise<SessionUser | null> | null = null;

export async function ensureLocalUser(context: SessionContext): Promise<SessionUser | null> {
  pending ??= resolveLocalUser().finally(() => {
    pending = null;
  });
  const user = await pending;
  if (user) await context.session?.set("userId", user.id);
  return user;
}

async function resolveLocalUser(): Promise<SessionUser | null> {
  const db = getDb();
  const users = await db.select().from(schema.users).limit(2);
  if (users.length === 1) return users[0]!;
  if (users.length > 1) return null;

  // First run: provision a passwordless owner from the OS user. CLI
  // detection is Node-only (ADR-2) — imported lazily; this branch is only
  // reachable when the desktop shell set the env flag.
  const { findExecutableOnPath, SUPPORTED_CLI_COMMANDS } = await import("@specpasa/providers/node");
  const username = process.env.SPECPASA_LOCAL_USER ?? process.env.USER ?? "local";
  const { userId } = await provisionOwner({
    name: username,
    email: `${username}@localhost`,
    passwordHash: null,
    workspaceName: t.auth.localWorkspaceName,
    cliCommands: SUPPORTED_CLI_COMMANDS.filter((command) => findExecutableOnPath(command)),
  });
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return user ?? null;
}
