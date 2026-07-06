import { defineMiddleware } from "astro:middleware";
import { getSessionUser, hasAnyUser } from "./lib/auth";

const PUBLIC_PREFIXES = ["/login", "/setup", "/invite", "/_astro", "/_actions", "/favicon"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.user = await getSessionUser(context);

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return next();
  }
  if (!context.locals.user) {
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return context.redirect((await hasAnyUser()) ? "/login" : "/setup");
  }
  return next();
});
