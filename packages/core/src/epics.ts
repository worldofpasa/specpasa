/**
 * TASKS-phase structuring (FR-INT-6): parse a tasks document into epics and
 * tasks. Convention: each `##` heading starts an epic; list items (`- ...`,
 * `* ...`, `- [ ] ...`) under it are tasks; other text under the heading
 * becomes the epic description. Pure — UI lets the user review before export.
 */

export interface ParsedTask {
  title: string;
  description: string | null;
}

export interface ParsedEpic {
  title: string;
  description: string | null;
  tasks: ParsedTask[];
}

const EPIC_RE = /^##\s+(.+)$/;
const TASK_RE = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/;

function parseTask(text: string): ParsedTask {
  // "**Title** — description" or "Title — description" split into fields.
  const clean = text.trim().replace(/\*\*/g, "");
  const sep = clean.indexOf(" — ");
  if (sep > 0) {
    return { title: clean.slice(0, sep).trim(), description: clean.slice(sep + 3).trim() || null };
  }
  return { title: clean, description: null };
}

export function parseEpicsFromMarkdown(markdown: string): ParsedEpic[] {
  const epics: ParsedEpic[] = [];
  let current: ParsedEpic | null = null;
  let descriptionLines: string[] = [];
  let inFence = false;

  const flushDescription = () => {
    if (current && descriptionLines.length) {
      current.description = descriptionLines.join(" ").trim() || null;
    }
    descriptionLines = [];
  };

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const epicMatch = EPIC_RE.exec(line);
    if (epicMatch) {
      flushDescription();
      current = { title: epicMatch[1]!.trim(), description: null, tasks: [] };
      epics.push(current);
      continue;
    }
    if (!current) continue;

    const taskMatch = TASK_RE.exec(line);
    if (taskMatch) {
      flushDescription();
      current.tasks.push(parseTask(taskMatch[1]!));
      continue;
    }
    if (line.trim() && !line.startsWith("#")) descriptionLines.push(line.trim());
    if (line.startsWith("#")) flushDescription();
  }
  flushDescription();

  // An epic with no tasks is usually prose (e.g. "## Non-goals") — keep it
  // only if it has a description, so the review UI can drop it explicitly.
  return epics;
}
