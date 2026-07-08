import { useState } from "react";
import { t } from "../lib/strings";
import { initials, presenceHue } from "../lib/presence";
import { timeAgo } from "../lib/time";

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
      className={`text-sm ${thread.resolved ? "opacity-50" : ""}`}
    >
      {thread.quote && (
        <p
          className={`mb-1.5 border-l-[1.5px] pl-2 font-serif text-xs italic text-neutral-500 ${thread.resolved ? "border-line" : "border-review"}`}
        >
          {thread.quote}
        </p>
      )}
      {thread.comments.map((comment) => (
        <div key={comment.id} className="mb-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[7px] font-bold text-on-accent ${presenceHue(comment.author)}`}
            >
              {initials(comment.author)}
            </span>
            <span className="truncate">{comment.author}</span>
            <span className="shrink-0 font-mono text-[9px] font-normal text-neutral-400">
              {timeAgo(comment.createdAt)}
            </span>
          </p>
          <p className="mt-0.5 text-neutral-700 dark:text-neutral-300">{comment.body}</p>
        </div>
      ))}
      {thread.resolved ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-accent">
          {t.workspace.commentsResolved}
          {onReopen && (
            <button
              onClick={() => void onReopen(thread.id)}
              className="font-normal text-neutral-500 hover:underline"
            >
              {t.comments.reopen}
            </button>
          )}
        </p>
      ) : (
        <>
          {onReply && (
            <div className="mb-1.5 flex gap-1">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t.comments.replyPlaceholder}
                className="min-w-0 grow rounded border border-line bg-transparent px-2 py-1 text-xs placeholder:text-neutral-400"
              />
              <button
                onClick={() => {
                  if (!reply.trim()) return;
                  void onReply(thread.id, reply);
                  setReply("");
                }}
                className="rounded bg-accent px-2 py-1 text-xs font-semibold text-on-accent hover:opacity-90"
              >
                {t.comments.reply}
              </button>
            </div>
          )}
          {onResolve && (
            <button
              onClick={() => void onResolve(thread.id)}
              className="text-xs font-semibold text-accent hover:underline"
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
    <div className="flex flex-col gap-3 divide-y divide-dashed divide-line [&>article]:pt-3 [&>article:first-child]:pt-0">
      {threads.length === 0 ? (
        <p className="rounded border border-dashed border-line p-3 text-xs text-neutral-500">
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
