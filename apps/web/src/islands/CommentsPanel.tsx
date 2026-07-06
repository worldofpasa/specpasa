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

/**
 * Owns comment data + mutations for the spec workspace (FR-COLLAB-1..5) and
 * feeds the presentational CommentsRail. Block selection arrives from the
 * document sheet's "+" affordance via the `specpasa:comment-block` event —
 * islands can't exchange function props across the Astro boundary.
 */
export default function CommentsPanel({ specId, blocks, canComment }: Props) {
  const [threads, setThreads] = useState<ApiThread[]>([]);
  const [composerBlockId, setComposerBlockId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

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
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const { blockId } = (event as CustomEvent<{ blockId: string }>).detail;
      setComposerBlockId(blockId);
    };
    window.addEventListener("specpasa:comment-block", onSelect);
    return () => window.removeEventListener("specpasa:comment-block", onSelect);
  }, []);

  async function post() {
    if (!composerBlockId || !body.trim()) return;
    setBusy(true);
    await actions.createThread({ specId, blockId: composerBlockId, body });
    setBusy(false);
    setBody("");
    setComposerBlockId(null);
    await refresh();
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
          await actions.setThreadResolved({ threadId, resolved: true });
          await refresh();
        },
        onReopen: async (threadId: string) => {
          await actions.setThreadResolved({ threadId, resolved: false });
          await refresh();
        },
        onReply: async (threadId: string, replyBody: string) => {
          await actions.replyThread({ threadId, body: replyBody });
          await refresh();
        },
      }
    : {};

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500" data-testid="review-summary">
        {t.comments.summary(open, resolved)}
      </p>
      {canComment && composerBlockId && (
        <div className="rounded-lg border border-amber-300 bg-white p-3 shadow-sm dark:border-amber-800 dark:bg-neutral-900">
          <p className="text-xs font-semibold">{t.comments.composerHeading}</p>
          {snippetFor(composerBlockId) && (
            <p className="mt-1 border-l-2 border-amber-400 pl-2 text-xs italic text-neutral-500">
              {snippetFor(composerBlockId)}
            </p>
          )}
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={t.comments.placeholder}
            className="mt-2 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void post()}
              disabled={busy || !body.trim()}
              className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
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
  );
}
