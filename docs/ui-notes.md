# UI notes — deferred refinements

The spec workspace (M3) ships a Google-Docs-like three-panel layout: collapsible
outline + attachments on the left, the rendered document sheet in the center
(block-wrapped with stable `data-block-id` anchors), a floating AI bar, and a
comments rail on the right. These refinements were noted during that work and
deliberately deferred:

- **Per-block inline editing** — edit mode currently swaps the whole sheet for a
  markdown textarea. Docs-style in-place editing of a single block (click into a
  block, edit, blur → new version or pending change) needs a per-block editor and
  a draft-state model; revisit alongside the CRDT groundwork (ADR-5).
- **Text-range comment anchoring** — the schema already stores an optional
  `text_range` (start/end/quote) per thread; the workspace only exposes
  block-level anchors today. Requires selection tracking inside rendered HTML.
- **Selection popover** — Docs-style floating toolbar on text selection
  (comment, emoji reaction, quote). Depends on text-range anchoring.
- **Realtime cursors & presence** — M5 (WebSockets on Node, Durable Objects on
  Cloudflare, per ADR-6).
- **Outline active-section highlight** — track scroll position and highlight the
  current heading in the left panel (IntersectionObserver over
  `[data-block-id]`).
- **Drag-to-reorder blocks** — reordering blocks from the outline or the sheet
  margin; stable block IDs make this cheap on the data side, UI needs DnD.
- **Attachment previews** — hover cards for url/github_code attachments
  (favicon, title, snippet) instead of bare links; file-kind attachments still
  unsupported entirely.
- **Floating AI bar placement** — the bar is viewport-centered; ideally it
  centers on the content column and avoids overlapping the sheet's last lines
  beyond the reserved bottom padding.
- **Comments rail on small screens** — currently hidden below `xl`; needs a
  slide-over/drawer treatment on narrow viewports (as does the outline below
  `lg`).
