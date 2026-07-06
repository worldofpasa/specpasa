import { useRef, useState } from "react";
import { actions } from "astro:actions";
import { marked } from "marked";
import { t } from "../lib/strings";

interface ProviderOption {
  id: string;
  label: string;
}

interface Props {
  specId: string;
  initialMarkdown: string;
  versionNumber: number;
  providers: ProviderOption[];
  frozen: boolean;
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

function EditorPane({
  markdown,
  showPreview,
  frozen,
  onChange,
}: {
  markdown: string;
  showPreview: boolean;
  frozen: boolean;
  onChange: (value: string) => void;
}) {
  if (showPreview) {
    return (
      <div
        className="prose prose-neutral max-w-none px-6 py-4 dark:prose-invert [&_code]:text-sm"
        dangerouslySetInnerHTML={{ __html: marked.parse(markdown) as string }}
      />
    );
  }
  return (
    <textarea
      value={markdown}
      onChange={(e) => onChange(e.target.value)}
      disabled={frozen}
      rows={20}
      placeholder={t.editor.placeholder}
      className="w-full resize-y bg-transparent px-4 py-3 font-mono text-sm outline-none"
    />
  );
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

function AiPanel({
  specId,
  versionNumber,
  providers,
  frozen,
}: Pick<Props, "specId" | "versionNumber" | "providers" | "frozen">) {
  const [prompt, setPrompt] = useState("");
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [streaming, setStreaming] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<HTMLPreElement>(null);

  const idleLabel = versionNumber === 0 ? t.editor.aiDraft : t.editor.aiRevise;

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

  if (providers.length === 0) {
    return (
      <p className="mt-2 text-sm text-neutral-500">
        {t.editor.aiNoProviders}
        <a href="/settings/providers" className="underline">
          {t.editor.aiNoProvidersLink}
        </a>
        .
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder={versionNumber === 0 ? t.editor.aiPromptDraft : t.editor.aiPromptRevise}
        className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
      <div className="flex items-center gap-3">
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          onClick={draftWithAi}
          disabled={streaming || frozen || !prompt.trim()}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {streaming ? t.editor.aiGenerating : idleLabel}
        </button>
        <span className="text-xs text-neutral-500">{t.editor.aiAutoSaveNote}</span>
      </div>
      {(streaming || streamed) && (
        <pre
          ref={streamRef}
          className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-950"
        >
          {streamed || "…"}
        </pre>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function SpecEditor({
  specId,
  initialMarkdown,
  versionNumber,
  providers,
  frozen,
}: Props) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = markdown !== initialMarkdown;

  async function save() {
    setSaving(true);
    setSaveError(null);
    const { error } = await actions.saveVersion({ specId, markdown });
    setSaving(false);
    if (error) setSaveError(error.message);
    else window.location.reload();
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
          <span className="font-semibold">
            {versionNumber === 0 ? t.editor.blankSpec : t.editor.version(versionNumber)}
          </span>
          {dirty && <span className="text-xs text-amber-600">{t.editor.unsaved}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {showPreview ? t.editor.edit : t.editor.preview}
            </button>
            <button
              onClick={save}
              disabled={saving || frozen || !dirty}
              className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {saving ? t.editor.saving : t.editor.save}
            </button>
          </div>
        </div>
        <EditorPane
          markdown={markdown}
          showPreview={showPreview}
          frozen={frozen}
          onChange={setMarkdown}
        />
        {saveError && <p className="px-4 pb-3 text-sm text-red-600">{saveError}</p>}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">{t.editor.aiHeading}</h2>
        <AiPanel
          specId={specId}
          versionNumber={versionNumber}
          providers={providers}
          frozen={frozen}
        />
      </section>
    </div>
  );
}
