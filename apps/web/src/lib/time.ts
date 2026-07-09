/** Compact relative timestamps for comment bylines ("2h ago"). */
export function timeAgo(timestamp: number): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "always", style: "narrow" });
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return rtf.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}
