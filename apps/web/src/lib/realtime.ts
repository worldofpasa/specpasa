/**
 * In-process realtime hub for spec events and presence (ADR-6).
 *
 * Comments/resolutions are append-only, so live updates only need a "changed"
 * signal per spec — subscribers refetch through the existing comments API.
 * Presence is derived from the set of open SSE connections per spec:
 * ephemeral, in-memory, no schema.
 *
 * Single-process by design: this hub lives in module state, so it fans out
 * only within one Node process. Multi-process/edge deployments need a shared
 * broker (or Durable Objects on the Cloudflare target) — see ADR-6. Stashed
 * on globalThis so Vite's dev SSR module duplication can't split the bus.
 */

export type SpecEvent = { type: "comments" } | { type: "presence"; viewers: Viewer[] };

export interface Viewer {
  userId: string;
  name: string;
}

interface Connection {
  id: string;
  specId: string;
  userId: string;
  name: string;
  send: (event: string, data: unknown) => void;
  /** Hub-initiated shutdown — must run the owning stream's full teardown. */
  close: () => void;
}

/** Per user per spec; the oldest connection is closed when exceeded. */
const MAX_CONNECTIONS_PER_USER = 5;

interface Hub {
  connections: Map<string, Set<Connection>>;
}

const hub: Hub = ((globalThis as Record<string, unknown>).__specpasaRealtimeHub ??= {
  connections: new Map<string, Set<Connection>>(),
}) as Hub;

function connectionsFor(specId: string): Set<Connection> {
  let set = hub.connections.get(specId);
  if (!set) {
    set = new Set();
    hub.connections.set(specId, set);
  }
  return set;
}

/** Current viewers of a spec, deduplicated by user. */
export function viewersFor(specId: string): Viewer[] {
  const seen = new Map<string, Viewer>();
  for (const connection of hub.connections.get(specId) ?? []) {
    seen.set(connection.userId, { userId: connection.userId, name: connection.name });
  }
  return [...seen.values()];
}

function broadcast(specId: string, event: string, data: unknown): void {
  for (const connection of hub.connections.get(specId) ?? []) {
    try {
      connection.send(event, data);
    } catch {
      // A dead connection is cleaned up by its own cancel handler.
    }
  }
}

/** Notify all viewers of a spec that comment state changed (they refetch). */
export function publishCommentsChanged(specId: string): void {
  broadcast(specId, "comments", { changed: true });
}

function broadcastPresence(specId: string): void {
  broadcast(specId, "presence", { viewers: viewersFor(specId) });
}

/** Register an SSE connection; returns an unsubscribe function. */
export function connect(connection: Connection): () => void {
  const set = connectionsFor(connection.specId);
  // Cap streams per user per spec (leak/abuse guard). Sets iterate in
  // insertion order, so the first match is the oldest connection; close()
  // runs that stream's full teardown, which unregisters it from the set.
  const mine = [...set].filter((existing) => existing.userId === connection.userId);
  if (mine.length >= MAX_CONNECTIONS_PER_USER) {
    mine[0]?.close();
  }
  set.add(connection);
  broadcastPresence(connection.specId);
  return () => {
    const current = hub.connections.get(connection.specId);
    current?.delete(connection);
    if (current && current.size === 0) hub.connections.delete(connection.specId);
    broadcastPresence(connection.specId);
  };
}
