import { useEffect, useRef, useState } from "react";
import { renderMermaidSource } from "./mermaid-render";

/** Client-side mermaid diagram for server-rendered read views (FR-DIAG-1). */
export default function Mermaid({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void renderMermaidSource(source).then((svg) => {
      if (cancelled) return;
      if (svg && ref.current) ref.current.innerHTML = svg;
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (failed) {
    return (
      <pre className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-white px-4 py-2 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-900">
        {source}
      </pre>
    );
  }
  return (
    <div
      ref={ref}
      className="flex justify-center overflow-x-auto rounded-md border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
    />
  );
}
