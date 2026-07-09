/**
 * Presence hues (The Study, #16): every collaborator owns one palette hue,
 * reused everywhere they appear — presence crew, comment bylines. Keyed by
 * display name so islands that only know an author name (comments) land on
 * the same hue as the presence stack.
 */
export const PRESENCE_HUES = ["bg-accent", "bg-review", "bg-frozen", "bg-clay"] as const;

export function presenceHue(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return PRESENCE_HUES[hash % PRESENCE_HUES.length]!;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
