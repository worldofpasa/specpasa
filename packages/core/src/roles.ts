import { MEMBER_ROLES, type MemberRole } from "./types.js";

/**
 * Role policy (FR-TEN-2..5). Roles are ordered by privilege; each predicate
 * names a capability the Astro actions enforce. Pure functions so they can be
 * unit-tested exhaustively and reused by future policy surfaces (M2+).
 */
const RANK: Record<MemberRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

export function roleAtLeast(role: MemberRole, floor: MemberRole): boolean {
  return RANK[role] >= RANK[floor];
}

/** View specs, versions, and comments. */
export function canView(role: MemberRole): boolean {
  return roleAtLeast(role, "viewer");
}

/** Create and resolve comment threads, reply to them. */
export function canComment(role: MemberRole): boolean {
  return roleAtLeast(role, "commenter");
}

/** Create/edit projects, intents, specs, and versions (incl. AI drafts). */
export function canEdit(role: MemberRole): boolean {
  return roleAtLeast(role, "editor");
}

/** Invite/remove members and manage workspace settings. */
export function canManageMembers(role: MemberRole): boolean {
  return roleAtLeast(role, "owner");
}

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}
