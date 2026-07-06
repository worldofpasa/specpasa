import { useCallback, useEffect, useState } from "react";
import { actions } from "astro:actions";
import { t } from "../lib/strings";

interface BlockRef {
  block_id: string;
  snippet: string;
}

interface Thread {
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

function ThreadCard({
  thread,
  canComment,
  onChanged,
}: {
  thread: Thread;
  canComment: boolean;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitReply() {
    setBusy(true);
    await actions.replyThread({ threadId: thread.id, body: reply });
    setReply("");
    setBusy(false);
    onChanged();
  }

  async function setResolved(resolved: boolean) {
    setBusy(true);
    await actions.setThreadResolved({ threadId: thread.id, resolved });
    setBusy(false);
    onChanged();
  }

  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        thread.resolved
          ? "border-neutral-200 opacity-60 dark:border-neutral-800"
          : "border-amber-300 dark:border-amber-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            thread.resolved
              ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {thread.resolved ? t.comments.resolved : t.comments.open}
        </span>
        {canComment && (
          <button
            onClick={() => setResolved(!thread.resolved)}
            disabled={busy}
            className="ml-auto text-xs text-neutral-500 hover:underline"
          >
            {thread.resolved ? t.comments.reopen : t.comments.resolve}
          </button>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {thread.comments.map((comment) => (
          <li key={comment.id}>
            <span className="font-semibold">{comment.author}</span>{" "}
            <span className="text-xs text-neutral-400">
              {new Date(comment.created_at).toLocaleString()}
            </span>
            <p className="whitespace-pre-wrap">{comment.body}</p>
          </li>
        ))}
      </ul>
      {canComment && !thread.resolved && (
        <div className="mt-2 flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t.comments.replyPlaceholder}
            className="grow rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            onClick={submitReply}
            disabled={busy || !reply.trim()}
            className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t.comments.reply}
          </button>
        </div>
      )}
    </div>
  );
}

function BlockRow({
  block,
  threads,
  canComment,
  onChanged,
  specId,
}: {
  block: BlockRef;
  threads: Thread[];
  canComment: boolean;
  onChanged: () => void;
  specId: string;
}) {
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await actions.createThread({ specId, blockId: block.block_id, body });
    setBody("");
    setComposing(false);
    setBusy(false);
    onChanged();
  }

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <pre className="grow overflow-hidden whitespace-pre-wrap font-mono text-xs text-neutral-500">
          {block.snippet}
        </pre>
        <span className="shrink-0 text-xs text-neutral-400">
          {t.comments.threadCount(threads.length)}
        </span>
        {canComment && (
          <button
            onClick={() => setComposing((v) => !v)}
            className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {t.comments.commentOn}
          </button>
        )}
      </div>
      {composing && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t.comments.placeholder}
            className="grow rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            onClick={submit}
            disabled={busy || !body.trim()}
            className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t.comments.post}
          </button>
        </div>
      )}
      {threads.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {threads.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              canComment={canComment}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </li>
  );
}

export default function Comments({ specId, blocks, canComment }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/specs/${specId}/comments`);
    if (response.ok) {
      const data = (await response.json()) as { threads: Thread[] };
      setThreads(data.threads);
    }
  }, [specId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const open = threads.filter((thread) => !thread.resolved).length;
  const resolved = threads.length - open;
  const byBlock = new Map<string, Thread[]>();
  for (const thread of threads) {
    byBlock.set(thread.block_id, [...(byBlock.get(thread.block_id) ?? []), thread]);
  }

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold">{t.comments.heading}</h2>
        <span className="text-xs text-neutral-500" data-testid="review-summary">
          {t.comments.summary(open, resolved)}
        </span>
      </div>
      {blocks.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">{t.comments.noBlocks}</p>
      ) : (
        <>
          {threads.length === 0 && (
            <p className="mt-2 text-sm text-neutral-500">{t.comments.empty}</p>
          )}
          <ul className="mt-3 flex flex-col gap-2">
            {blocks.map((block) => (
              <BlockRow
                key={block.block_id}
                block={block}
                threads={byBlock.get(block.block_id) ?? []}
                canComment={canComment}
                onChanged={refresh}
                specId={specId}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
