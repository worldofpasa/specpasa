import { useState } from "react";
import { t } from "../lib/strings";

/**
 * Contract for M2 (collaboration): the rail renders whatever threads it is
 * given, keyed by the same stable block ULIDs the document sheet exposes as
 * `data-block-id` attributes. M2 supplies the data plus the post/resolve
 * handlers — layout and empty state live here and should not need changes.
 */
export interface CommentEntry {
  id: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface CommentThreadCard {
  id: string;
  /** Anchor: matches a `data-block-id` in the document sheet. */
  blockId: string;
  quote?: string;
  resolved: boolean;
  comments: CommentEntry[];
}

interface Props {
  threads: CommentThreadCard[];
  onPost?: (blockId: string, body: string) => void | Promise<void>;
  onResolve?: (threadId: string) => void | Promise<void>;
  /** Additive M2 handlers — cards stay read-only when absent. */
  onReopen?: (threadId: string) => void | Promise<void>;
  onReply?: (threadId: string, body: string) => void | Promise<void>;
}

function ThreadCard({
  thread,
  onResolve,
  onReopen,
  onReply,
}: {
  thread: CommentThreadCard;
  onResolve?: Props["onResolve"];
  onReopen?: Props["onReopen"];
  onReply?: Props["onReply"];
}) {
  const [reply, setReply] = useState("");
  return (
    <article
      data-thread-block-id={thread.blockId}
      className={`rounded-lg border border-neutral-200 bg-white p-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${thread.resolved ? "opacity-60" : ""}`}
    >
      {thread.quote && (
        <p className="mb-2 border-l-2 border-amber-400 pl-2 text-xs italic text-neutral-500">
          {thread.quote}
        </p>
      )}
      {thread.comments.map((comment) => (
        <div key={comment.id} className="mb-2">
          <p className="text-xs font-semibold">{comment.author}</p>
          <p className="text-neutral-700 dark:text-neutral-300">{comment.body}</p>
        </div>
      ))}
      {thread.resolved ? (
        <p className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
          {t.workspace.commentsResolved}
          {onReopen && (
            <button
              onClick={() => void onReopen(thread.id)}
              className="text-neutral-500 hover:underline"
            >
              {t.comments.reopen}
            </button>
          )}
        </p>
      ) : (
        <>
          {onReply && (
            <div className="mb-2 flex gap-1">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t.comments.replyPlaceholder}
                className="min-w-0 grow rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
              />
              <button
                onClick={() => {
                  if (!reply.trim()) return;
                  void onReply(thread.id, reply);
                  setReply("");
                }}
                className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
              >
                {t.comments.reply}
              </button>
            </div>
          )}
          {onResolve && (
            <button
              onClick={() => void onResolve(thread.id)}
              className="text-xs text-neutral-500 hover:underline"
            >
              {t.comments.resolve}
            </button>
          )}
        </>
      )}
    </article>
  );
}

export default function CommentsRail({ threads, onResolve, onReopen, onReply }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t.workspace.commentsHeading}
      </h2>
      {threads.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-500 dark:border-neutral-700">
          {t.workspace.commentsEmpty}
        </p>
      ) : (
        threads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            onResolve={onResolve}
            onReopen={onReopen}
            onReply={onReply}
          />
        ))
      )}
    </div>
  );
}
