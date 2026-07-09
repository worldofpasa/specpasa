import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { actions } from "astro:actions";
import { marked } from "marked";
import { blocksToMarkdown, fencedContent, type SpecBlock } from "@specpasa/core";
import { t } from "../lib/strings";
import Mermaid from "./Mermaid";

interface ProviderOption {
  id: string;
  label: string;
}

interface Props {
  specId: string;
  versionNumber: number;
  frozen: boolean;
  providers: ProviderOption[];
  blocks: SpecBlock[];
  /** All revision numbers, oldest first — rendered as the revision strip. */
  versions: number[];
  /** Editors can switch to edit mode, save, and use AI (canEdit role). */
  canEditDoc: boolean;
  /** Commenters+ get the per-block "+" affordance (canComment role). */
  commentsEnabled: boolean;
  /** Server-rendered attachments section (Astro named slot). */
  attachments?: ReactNode;
}

type StreamEvent =
  | { type: "token"; text: string }
  | { type: "done"; number: number }
  | { type: "error"; message: string };

async function* streamEvents(response: Response): AsyncIterable<StreamEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as StreamEvent;
    }
  }
}

interface DraftCallbacks {
  onToken: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

async function runDraft(
  body: { specId: string; providerId: string; prompt: string },
  callbacks: DraftCallbacks,
): Promise<void> {
  try {
    const response = await fetch("/api/ai/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      callbacks.onError(`Request failed (${response.status}): ${await response.text()}`);
      return;
    }
    for await (const event of streamEvents(response)) {
      if (event.type === "token") callbacks.onToken(event.text);
      else if (event.type === "error") callbacks.onError(event.message);
      else return callbacks.onDone();
    }
  } catch (e) {
    callbacks.onError(e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// Outline (left panel)

interface TocEntry {
  blockId: string;
  level: 1 | 2 | 3;
  text: string;
}

function tocFromBlocks(blocks: SpecBlock[]): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const block of blocks) {
    const firstLine = block.markdown.split("\n", 1)[0] ?? "";
    const match = /^(#{1,3})\s+(.+)$/.exec(firstLine);
    if (match) {
      entries.push({
        blockId: block.block_id,
        level: match[1]!.length as 1 | 2 | 3,
        text: match[2]!.trim(),
      });
    }
  }
  return entries;
}

function scrollToBlock(blockId: string) {
  document
    .querySelector(`[data-block-id="${blockId}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Hierarchical numbering relative to the document's top heading level (#33):
 * a doc starting at h2 numbers that h2 as "1" and an h3 under it as "1.1".
 * Level jumps (h1 straight to h3) clamp to the next depth down.
 */
function outlineLabels(entries: TocEntry[], minLevel: number): Map<string, string> {
  const counters: number[] = [];
  const labels = new Map<string, string>();
  for (const entry of entries) {
    const depth = Math.min(entry.level - minLevel, counters.length);
    counters.length = depth + 1;
    counters[depth] = (counters[depth] ?? 0) + 1;
    labels.set(entry.blockId, counters.join("."));
  }
  return labels;
}

function Outline({ entries }: { entries: TocEntry[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const minLevel = useMemo(
    () => (entries.length ? Math.min(...entries.map((entry) => entry.level)) : 1),
    [entries],
  );
  const labels = useMemo(() => outlineLabels(entries, minLevel), [entries, minLevel]);
  // Group deeper entries under the preceding top-level heading so sections fold.
  const groups = useMemo(() => {
    const result: { head: TocEntry; children: TocEntry[] }[] = [];
    for (const entry of entries) {
      if (entry.level === minLevel || result.length === 0) {
        result.push({ head: entry, children: [] });
      } else {
        result[result.length - 1]!.children.push(entry);
      }
    }
    return result;
  }, [entries, minLevel]);

  if (entries.length === 0) {
    return <p className="px-3 py-2 text-xs text-neutral-500">{t.workspace.outlineEmpty}</p>;
  }
  return (
    <nav className="flex flex-col gap-0.5 p-2 text-sm">
      {groups.map((group) => (
        <div key={group.head.blockId}>
          <div className="flex items-center gap-1">
            {group.children.length > 0 && (
              <button
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.head.blockId)) next.delete(group.head.blockId);
                    else next.add(group.head.blockId);
                    return next;
                  })
                }
                className="w-4 text-xs text-neutral-400 hover:text-ink"
              >
                {collapsed.has(group.head.blockId) ? "▸" : "▾"}
              </button>
            )}
            <button
              onClick={() => scrollToBlock(group.head.blockId)}
              className="flex min-w-0 flex-1 items-baseline gap-2 rounded px-2 py-1 text-left font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span className="shrink-0 font-mono text-[10px] text-neutral-400">
                {labels.get(group.head.blockId)}
              </span>
              <span className="truncate">{group.head.text}</span>
            </button>
          </div>
          {!collapsed.has(group.head.blockId) &&
            group.children.map((child) => (
              <button
                key={child.blockId}
                onClick={() => scrollToBlock(child.blockId)}
                className={`flex w-full min-w-0 items-baseline gap-2 rounded px-2 py-0.5 text-left text-neutral-500 hover:bg-neutral-100 hover:text-ink dark:hover:bg-neutral-800 ${child.level - minLevel === 1 ? "ml-5" : "ml-9"}`}
              >
                <span className="shrink-0 font-mono text-[10px] text-neutral-400">
                  {labels.get(child.blockId)}
                </span>
                <span className="truncate">{child.text}</span>
              </button>
            ))}
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Document sheet (center)

export function requestBlockComment(blockId: string) {
  window.dispatchEvent(new CustomEvent("specpasa:comment-block", { detail: { blockId } }));
}

function DocBlock({
  block,
  commentsEnabled,
  openThreads,
}: {
  block: SpecBlock;
  commentsEnabled: boolean;
  /** Open comment threads anchored to this block — marigold flag when > 0. */
  openThreads: number;
}) {
  const flagged = openThreads > 0;
  return (
    <div
      data-block-id={block.block_id}
      className={`group relative scroll-mt-24 ${flagged ? "-mx-3 rounded bg-review-soft/70 px-3 py-1" : ""}`}
    >
      {/* Inside the block's edge so the hover area stays contiguous (#26) —
          at -right-9 the pointer left the block crossing the gap and the
          button vanished before it could be clicked. */}
      <button
        disabled={!commentsEnabled}
        title={commentsEnabled ? t.workspace.commentAdd : t.workspace.commentStub}
        aria-label={commentsEnabled ? t.workspace.commentAdd : t.workspace.commentStub}
        onClick={() => commentsEnabled && requestBlockComment(block.block_id)}
        className="invisible absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-sheet text-sm text-neutral-400 shadow-sm hover:border-accent hover:text-accent focus-visible:visible group-hover:visible"
      >
        +
      </button>
      {flagged && (
        <span
          title={t.lifecycle.openThreadsWarning(openThreads)}
          className="absolute -right-2.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-review font-mono text-[10px] font-bold text-on-accent"
        >
          {openThreads}
        </span>
      )}
      {block.type === "mermaid" ? (
        <Mermaid source={fencedContent(block.markdown)} />
      ) : (
        <div
          className="prose prose-neutral max-w-none font-serif prose-headings:font-sans dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: marked.parse(block.markdown) as string }}
        />
      )}
    </div>
  );
}

function Sheet({
  blocks,
  commentsEnabled,
  openCounts,
}: {
  blocks: SpecBlock[];
  commentsEnabled: boolean;
  openCounts: Record<string, number>;
}) {
  return (
    <div className="relative mx-auto w-full max-w-3xl rounded border border-line bg-sheet px-12 py-10 shadow-sm">
      {blocks.length === 0 ? (
        <p className="text-sm text-neutral-500">{t.workspace.emptySheet}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((block) => (
            <DocBlock
              key={block.block_id}
              block={block}
              commentsEnabled={commentsEnabled}
              openThreads={openCounts[block.block_id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revision strip (bottom dock) — every version as a labelled cell

function RevisionStrip({
  specId,
  versions,
  versionNumber,
}: Pick<Props, "specId" | "versions" | "versionNumber">) {
  if (versions.length === 0) return null;
  return (
    <nav
      aria-label={t.versions.heading}
      className="flex min-w-0 flex-1 overflow-x-auto rounded border border-line bg-sheet"
    >
      {versions.map((n) => {
        const isCurrent = n === versionNumber;
        return (
          <a
            key={n}
            href={isCurrent ? `/specs/${specId}/versions` : `/specs/${specId}/versions/${n}`}
            className="flex flex-col border-r border-line px-3 py-1.5 last:border-r-0 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-neutral-400">
              {t.workspace.titleBlock.rev}
            </span>
            <span
              className={`font-mono text-xs font-semibold ${isCurrent ? "text-accent" : "text-neutral-500"}`}
            >
              {t.versions.versionBase(n)}
              {isCurrent ? " ●" : ""}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Ask-AI tray (centered in the dock; hover opens, click-outside/Esc closes)

function FloatingAi({
  specId,
  versionNumber,
  frozen,
  providers,
  openComments,
}: Pick<Props, "specId" | "versionNumber" | "frozen" | "providers"> & {
  /** Open review threads — drafting includes them, and the tray says so. */
  openComments: number;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [streaming, setStreaming] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  streamingRef.current = streaming;

  // Click-outside / Escape close the composer — never mid-stream (#25).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (streamingRef.current) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !streamingRef.current) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (frozen || providers.length === 0) return null;

  async function draftWithAi() {
    setStreaming(true);
    setStreamed("");
    setError(null);
    await runDraft(
      { specId, providerId, prompt },
      {
        onToken: (text) => {
          setStreamed((prev) => prev + text);
          streamRef.current?.scrollTo(0, streamRef.current.scrollHeight);
        },
        onError: setError,
        onDone: () => window.location.reload(),
      },
    );
    setStreaming(false);
  }

  return (
    <div ref={containerRef} className="relative flex items-stretch">
      <button
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded border border-accent bg-accent-soft px-5 py-1.5 text-sm font-semibold text-accent shadow-sm hover:opacity-90"
      >
        {t.workspace.aiPill}
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-30 mb-2 w-[min(44rem,80vw)] -translate-x-1/2 rounded-lg border border-accent bg-sheet p-3 shadow-xl">
      {(streaming || streamed) && (
        <pre
          ref={streamRef}
          className="mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-100 p-2 font-mono text-xs dark:bg-neutral-950"
        >
          {streamed || "…"}
        </pre>
      )}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder={versionNumber === 0 ? t.editor.aiPromptDraft : t.editor.aiPromptRevise}
        className="w-full rounded border border-line bg-transparent px-3 py-2 text-sm placeholder:text-neutral-400"
      />
      <div className="mt-2 flex items-center gap-2">
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="rounded border border-line bg-transparent px-2 py-1.5 text-xs"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
        <button
          onClick={draftWithAi}
          disabled={streaming || !prompt.trim()}
          className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-40"
        >
          {streaming
            ? t.editor.aiGenerating
            : versionNumber === 0
              ? t.editor.aiDraft
              : t.editor.aiRevise}
        </button>
        <span className="hidden text-xs text-neutral-500 sm:inline">{t.editor.aiAutoSaveNote}</span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-xs text-neutral-500 hover:underline"
        >
          {t.workspace.aiCollapse}
        </button>
      </div>
      {openComments > 0 && (
        <p className="mt-2 border-t border-dashed border-line pt-2 font-mono text-[10px] text-review">
          {t.editor.aiIncludesComments(openComments)}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

interface ToolbarProps {
  versionNumber: number;
  dirty: boolean;
  frozen: boolean;
  canEditDoc: boolean;
  saving: boolean;
  mode: "reading" | "edit";
  setMode: (mode: "reading" | "edit") => void;
  onSave: () => void;
}

function WorkspaceToolbar({
  versionNumber,
  dirty,
  frozen,
  canEditDoc,
  saving,
  mode,
  setMode,
  onSave,
}: ToolbarProps) {
  return (
    <div className="mb-3 flex items-center gap-3 text-sm">
      <span className="font-semibold">
        {versionNumber === 0 ? t.editor.blankSpec : t.editor.version(versionNumber)}
      </span>
      {dirty && <span className="text-xs text-review">{t.editor.unsaved}</span>}
      <div className="ml-auto flex items-center gap-2">
        {!frozen && canEditDoc && (
          <div className="flex overflow-hidden rounded border border-neutral-300 text-xs dark:border-neutral-700">
            <button
              onClick={() => setMode("reading")}
              className={`px-3 py-1 ${mode === "reading" ? "bg-ink text-paper" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            >
              {t.workspace.reading}
            </button>
            <button
              onClick={() => setMode("edit")}
              className={`px-3 py-1 ${mode === "edit" ? "bg-ink text-paper" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            >
              {t.workspace.editing}
            </button>
          </div>
        )}
        {mode === "edit" && !frozen && canEditDoc && (
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className="rounded bg-accent px-3 py-1 text-xs font-semibold text-on-accent hover:opacity-90 disabled:opacity-40"
          >
            {saving ? t.editor.saving : t.editor.save}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace shell

export default function SpecWorkspace({
  specId,
  versionNumber,
  frozen,
  providers,
  blocks,
  versions,
  canEditDoc,
  commentsEnabled,
  attachments,
}: Props) {
  const [mode, setMode] = useState<"reading" | "edit">(
    versionNumber === 0 && !frozen && canEditDoc ? "edit" : "reading",
  );
  const initialMarkdown = useMemo(() => blocksToMarkdown(blocks), [blocks]);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [leftOpen, setLeftOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});
  const toc = useMemo(() => tocFromBlocks(blocks), [blocks]);
  const dirty = markdown !== initialMarkdown;

  // Per-block open-thread counts arrive from CommentsPanel (the data owner)
  // so flagged blocks stay live with SSE updates.
  useEffect(() => {
    const onThreads = (event: Event) => {
      const { counts } = (event as CustomEvent<{ counts: Record<string, number> }>).detail;
      setOpenCounts(counts);
    };
    window.addEventListener("specpasa:threads", onThreads);
    return () => window.removeEventListener("specpasa:threads", onThreads);
  }, []);

  async function save() {
    setSaving(true);
    setSaveError(null);
    const { error } = await actions.saveVersion({ specId, markdown });
    setSaving(false);
    if (error) setSaveError(error.message);
    else window.location.reload();
  }

  return (
    <div className="flex gap-6">
      <aside
        className={`sticky top-6 hidden max-h-[85vh] shrink-0 flex-col self-start overflow-y-auto lg:flex ${leftOpen ? "w-60" : "w-8"}`}
      >
        <button
          onClick={() => setLeftOpen((v) => !v)}
          title={leftOpen ? t.workspace.collapsePanel : t.workspace.expandPanel}
          className="mb-2 self-start rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {leftOpen ? "«" : "»"}
        </button>
        {leftOpen && (
          <div className="flex flex-col gap-4">
            <div className="rounded border border-line bg-sheet">
              <h2 className="border-b border-line px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                {t.workspace.outline}
              </h2>
              <Outline entries={toc} />
            </div>
            {attachments}
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1 pb-8">
        <WorkspaceToolbar
          versionNumber={versionNumber}
          dirty={dirty}
          frozen={frozen}
          canEditDoc={canEditDoc}
          saving={saving}
          mode={mode}
          setMode={setMode}
          onSave={save}
        />

        {mode === "reading" || frozen || !canEditDoc ? (
          <Sheet blocks={blocks} commentsEnabled={commentsEnabled} openCounts={openCounts} />
        ) : (
          <div className="mx-auto w-full max-w-3xl rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={24}
              placeholder={t.editor.placeholder}
              className="w-full resize-y bg-transparent px-6 py-5 font-mono text-sm outline-none"
            />
          </div>
        )}
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}

        {/* Bottom dock: revision strip left, Ask-AI tray centered on the
            content column (The Study, #18/#25). */}
        <div className="sticky bottom-4 z-20 mt-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
          <div className="flex min-w-0 items-stretch">
            <RevisionStrip specId={specId} versions={versions} versionNumber={versionNumber} />
          </div>
          <div className="flex items-stretch">
            {canEditDoc && (
              <FloatingAi
                specId={specId}
                versionNumber={versionNumber}
                frozen={frozen}
                providers={providers}
                openComments={Object.values(openCounts).reduce((sum, n) => sum + n, 0)}
              />
            )}
          </div>
          <div aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}
