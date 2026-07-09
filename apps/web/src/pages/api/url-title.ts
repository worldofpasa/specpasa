import type { APIRoute } from "astro";

/**
 * Fetch a page's <title> for reference auto-titling (#27). Same server-side
 * fetch exposure as reference resolution (lib/references.ts) — self-hosted,
 * authenticated callers only.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response("Unauthorized", { status: 401 });
  const target = url.searchParams.get("url") ?? "";
  if (!/^https?:\/\//.test(target)) return new Response("Bad url", { status: 400 });

  const fallback = () => {
    try {
      const parsed = new URL(target);
      return parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname : "");
    } catch {
      return "";
    }
  };

  let title = "";
  try {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(4000),
      headers: { accept: "text/html" },
    });
    const head = (await response.text()).slice(0, 100_000);
    title = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  } catch {
    // Network failure degrades to the URL-derived fallback below.
  }
  return new Response(JSON.stringify({ title: title || fallback() }), {
    headers: { "content-type": "application/json" },
  });
};
