import { useEffect, useState } from "react";
import { t } from "../lib/strings";

interface Viewer {
  userId: string;
  name: string;
}

const CHIP_COLORS = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-sky-600",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function colorFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return CHIP_COLORS[hash % CHIP_COLORS.length]!;
}

/**
 * Live viewer avatars for the workspace header (ADR-6 presence). Fed by the
 * CommentsPanel island's SSE subscription via the `specpasa:presence`
 * CustomEvent — one stream per page, no second connection.
 */
export default function PresenceChips() {
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

  return (
    <div
      className="flex items-center -space-x-1.5"
      aria-label={t.presence.label}
      data-testid="presence-chips"
    >
      {viewers.map((viewer) => (
        <span
          key={viewer.userId}
          title={t.presence.viewing(viewer.name)}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white dark:border-neutral-900 ${colorFor(viewer.userId)}`}
        >
          {initials(viewer.name)}
        </span>
      ))}
    </div>
  );
}
