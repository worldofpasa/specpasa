import { useCallback, useEffect, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { t } from "../lib/strings";
import CommentsRail, { type CommentThreadCard } from "./CommentsRail";

interface BlockRef {
  block_id: string;
  snippet: string;
}

interface ApiThread {
  id: string;
  block_id: string;
  resolved: boolean;
  comments: { id: string; author: string; body: string; created_at: number }[];
}

interface Props {
  specId: string;
  blocks: BlockRef[];
  canComment: boolean;
}

const POLL_MS = 5000;
const RECONCILE_MS = 30_000;

/**
 * Owns comment data + mutations for the spec workspace (FR-COLLAB-1..5) and
 * feeds the presentational CommentsRail. Block selection arrives from the
 * document sheet's "+" affordance via the `specpasa:comment-block` event —
 * islands can't exchange function props across the Astro boundary.
 *
 * Live updates (ADR-6): subscribes to the spec's SSE stream; a `comments`
 * event triggers a refetch, `presence` events are re-dispatched to the
 * PresenceChips island via `specpasa:presence`. If the stream closes for
 * good, falls back to the original 5s polling.
 */
export default function CommentsPanel({ specId, blocks, canComment }: Props) {
  const [threads, setThreads] = useState<ApiThread[]>([]);
  const [composerBlockId, setComposerBlockId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const snippetFor = useMemo(() => {
    const map = new Map(blocks.map((block) => [block.block_id, block.snippet]));
    return (blockId: string) => map.get(blockId);
  }, [blocks]);
  const blockOrder = useMemo(
    () => new Map(blocks.map((block, index) => [block.block_id, index])),
    [blocks],
  );

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/specs/${specId}/comments`);
    if (response.ok) {
      const data = (await response.json()) as { threads: ApiThread[] };
      setThreads(data.threads);
    }
  }, [specId]);

  useEffect(() => {
    void refresh();
    // Slow reconcile poll, always on: the SSE hub fans out within one Node
    // process only, so a mutation served by a sibling process would never
    // reach this stream. A 30s refetch bounds that staleness cheaply.
    const reconcile = window.setInterval(() => void refresh(), RECONCILE_MS);
    let poll: number | undefined;
    const startPolling = () => {
      poll ??= window.setInterval(() => void refresh(), POLL_MS);
    };
    let source: EventSource | undefined;
    if (typeof EventSource === "undefined") {
      startPolling();
    } else {
      source = new EventSource(`/api/specs/${specId}/events`);
      source.addEventListener("comments", () => void refresh());
      source.addEventListener("presence", (event) => {
        const detail = JSON.parse((event as MessageEvent).data) as {
          viewers: { userId: string; name: string }[];
        };
        window.dispatchEvent(new CustomEvent("specpasa:presence", { detail }));
      });
      let opened = false;
      let failures = 0;
      source.onopen = () => {
        opened = true;
        failures = 0;
      };
      source.onerror = () => {
        failures += 1;
        // A CLOSED stream is terminal. A network-level failure never reaches
        // CLOSED — EventSource retries in CONNECTING forever — so also engage
        // polling after repeated failures. refresh() is idempotent, so
        // polling alongside a later-recovering stream is harmless.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          startPolling();
        } else if ((!opened && failures >= 3) || failures >= 5) {
          startPolling();
        }
      };
    }
    return () => {
      source?.close();
      window.clearInterval(reconcile);
      if (poll) window.clearInterval(poll);
    };
  }, [refresh, specId]);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const { blockId } = (event as CustomEvent<{ blockId: string }>).detail;
      setComposerBlockId(blockId);
    };
    window.addEventListener("specpasa:comment-block", onSelect);
    return () => window.removeEventListener("specpasa:comment-block", onSelect);
  }, []);

  // Feed per-block open-thread counts to the document sheet so commented
  // blocks carry the marigold flag (The Study, #17).
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const thread of threads) {
      if (!thread.resolved) counts[thread.block_id] = (counts[thread.block_id] ?? 0) + 1;
    }
    window.dispatchEvent(new CustomEvent("specpasa:threads", { detail: { counts } }));
  }, [threads]);

  /**
   * Every mutation reports failure into the pane (#34) — a rejected action
   * (expired session, network, authz) must never look like a silent no-op.
   */
  async function runMutation(mutate: () => Promise<{ error?: { message: string } | null }>) {
    setMutationError(null);
    setBusy(true);
    const { error } = await mutate();
    setBusy(false);
    if (error) {
      setMutationError(error.message);
      return false;
    }
    await refresh();
    return true;
  }

  async function post() {
    if (!composerBlockId || !body.trim()) return;
    const ok = await runMutation(() =>
      actions.createThread({ specId, blockId: composerBlockId, body }),
    );
    if (ok) {
      setBody("");
      setComposerBlockId(null);
    }
  }

  const cards: CommentThreadCard[] = threads
    .map((thread) => ({
      id: thread.id,
      blockId: thread.block_id,
      quote: snippetFor(thread.block_id),
      resolved: thread.resolved,
      comments: thread.comments.map((comment) => ({
        id: comment.id,
        author: comment.author,
        body: comment.body,
        createdAt: comment.created_at,
      })),
    }))
    .sort(
      (a, b) => (blockOrder.get(a.blockId) ?? Infinity) - (blockOrder.get(b.blockId) ?? Infinity),
    );

  const open = threads.filter((thread) => !thread.resolved).length;
  const resolved = threads.length - open;

  const handlers = canComment
    ? {
        onResolve: async (threadId: string) => {
          await runMutation(() => actions.setThreadResolved({ threadId, resolved: true }));
        },
        onReopen: async (threadId: string) => {
          await runMutation(() => actions.setThreadResolved({ threadId, resolved: false }));
        },
        onReply: async (threadId: string, replyBody: string) => {
          await runMutation(() => actions.replyThread({ threadId, body: replyBody }));
        },
      }
    : {};

  return (
    <div className="rounded border border-line bg-sheet">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
          {t.comments.heading}
        </h2>
        <p
          className={`font-mono text-[10px] ${open > 0 ? "text-review" : "text-neutral-400"}`}
          data-testid="review-summary"
        >
          {t.comments.summary(open, resolved)}
        </p>
      </div>
      <div className="flex flex-col gap-3 p-3">
        {mutationError && (
          <p className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {t.comments.actionFailed(mutationError)}
          </p>
        )}
        {canComment && composerBlockId && (
          <div className="rounded border border-review bg-sheet p-3">
            <p className="text-xs font-semibold">{t.comments.composerHeading}</p>
            {snippetFor(composerBlockId) && (
              <p className="mt-1 border-l-[1.5px] border-review pl-2 font-serif text-xs italic text-neutral-500">
                {snippetFor(composerBlockId)}
              </p>
            )}
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={t.comments.placeholder}
              className="mt-2 w-full rounded border border-line bg-transparent px-2 py-1.5 text-sm placeholder:text-neutral-400"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void post()}
                disabled={busy || !body.trim()}
                className="rounded bg-accent px-3 py-1 text-xs font-semibold text-on-accent hover:opacity-90 disabled:opacity-40"
              >
                {t.comments.post}
              </button>
              <button
                onClick={() => setComposerBlockId(null)}
                className="text-xs text-neutral-500 hover:underline"
              >
                {t.comments.cancel}
              </button>
            </div>
          </div>
        )}
        {canComment && !composerBlockId && threads.length === 0 && blocks.length > 0 && (
          <p className="text-xs text-neutral-500">{t.comments.selectHint}</p>
        )}
        <CommentsRail threads={cards} {...handlers} />
      </div>
    </div>
  );
}
