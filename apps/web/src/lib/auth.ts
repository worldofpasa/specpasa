import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, schema, eq } from "./db";

export type SessionUser = typeof schema.users.$inferSelect;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

interface SessionContext {
  session?: { get(key: string): Promise<unknown> } | undefined;
}

export async function getSessionUser(context: SessionContext): Promise<SessionUser | null> {
  const userId = (await context.session?.get("userId")) as string | undefined;
  if (!userId) return null;
  const [user] = await getDb().select().from(schema.users).where(eq(schema.users.id, userId));
  return user ?? null;
}

export async function hasAnyUser(): Promise<boolean> {
  const [user] = await getDb().select({ id: schema.users.id }).from(schema.users).limit(1);
  return Boolean(user);
}

/** The user's workspace — M1 is single-workspace per instance (FR-TEN-1). */
export async function getWorkspace(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ workspace: schema.workspaces })
    .from(schema.memberships)
    .innerJoin(schema.workspaces, eq(schema.memberships.workspace_id, schema.workspaces.id))
    .where(eq(schema.memberships.user_id, userId))
    .limit(1);
  if (!row) throw new Error("User has no workspace");
  return row.workspace;
}

/** Workspace + the user's role in it — the policy input for actions (M2). */
export async function getMembership(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ workspace: schema.workspaces, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.workspaces, eq(schema.memberships.workspace_id, schema.workspaces.id))
    .where(eq(schema.memberships.user_id, userId))
    .limit(1);
  if (!row) throw new Error("User has no workspace");
  return row;
}
