import { useEffect, useState } from "react";
import { t } from "../lib/strings";
import { initials, presenceHue } from "../lib/presence";

interface Viewer {
  userId: string;
  name: string;
}

interface Props {
  /** Current user's id — their avatar gets the self-ring. */
  selfId?: string;
}

const MAX_VISIBLE = 4;

/**
 * Live presence crew for the title block (ADR-6 presence, The Study #16).
 * Google-Docs-style stack: overlapping initials on palette hues, self-ring
 * for the current user, overflow chip past MAX_VISIBLE. Fed by the
 * CommentsPanel island's SSE subscription via the `specpasa:presence`
 * CustomEvent — one stream per page, no second connection.
 */
export default function PresenceChips({ selfId }: Props) {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    const onPresence = (event: Event) => {
      const { viewers: next } = (event as CustomEvent<{ viewers: Viewer[] }>).detail;
      setViewers(next);
    };
    window.addEventListener("specpasa:presence", onPresence);
    return () => window.removeEventListener("specpasa:presence", onPresence);
  }, []);

  if (viewers.length === 0) return null;

  const visible = viewers.slice(0, MAX_VISIBLE);
  const overflow = viewers.length - visible.length;

  return (
    <div className="flex items-center" aria-label={t.presence.label} data-testid="presence-chips">
      {visible.map((viewer, index) => (
        <span
          key={viewer.userId}
          title={t.presence.viewing(viewer.name)}
          aria-label={t.presence.viewing(viewer.name)}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-sheet font-mono text-[10px] font-semibold text-on-accent ${index > 0 ? "-ml-1.5" : ""} ${presenceHue(viewer.name)} ${viewer.userId === selfId ? "ring-2 ring-accent ring-offset-1 ring-offset-sheet" : ""}`}
        >
          {initials(viewer.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper font-mono text-[10px] text-neutral-500"
          title={t.presence.label}
        >
          {t.presence.more(overflow)}
        </span>
      )}
    </div>
  );
}
