let sequence = 0;

async function mermaidInstance() {
  // Dynamic import keeps the heavy mermaid bundle out of islands until a
  // diagram is actually on screen.
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
  return mermaid;
}

/** Render one mermaid source string to SVG markup; null if it doesn't parse. */
export async function renderMermaidSource(source: string): Promise<string | null> {
  try {
    const mermaid = await mermaidInstance();
    const { svg } = await mermaid.render(`specpasa-mermaid-${sequence++}`, source);
    return svg;
  } catch {
    return null;
  }
}

/** Replace `code.language-mermaid` blocks inside a container with diagrams. */
export async function renderMermaidIn(container: HTMLElement): Promise<void> {
  const nodes = Array.from(container.querySelectorAll("code.language-mermaid"));
  for (const code of nodes) {
    const svg = await renderMermaidSource(code.textContent ?? "");
    if (!svg) continue; // leave the source visible when the diagram is invalid
    const host = document.createElement("div");
    host.className = "my-4 flex justify-center overflow-x-auto";
    host.innerHTML = svg;
    (code.closest("pre") ?? code).replaceWith(host);
  }
}
