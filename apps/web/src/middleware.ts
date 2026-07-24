import { defineMiddleware } from "astro:middleware";
import { getSessionUser, hasAnyUser } from "./lib/auth";
import { ensureLocalUser, localAutologinEnabled } from "./lib/local-autologin";

const PUBLIC_PREFIXES = ["/login", "/setup", "/invite", "/_astro", "/_actions", "/favicon"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.user = await getSessionUser(context);

  if (localAutologinEnabled()) {
    context.locals.user ??= await ensureLocalUser(context);
    // Auto-logged-in requests have no business on the auth pages.
    const onAuthPage = pathname.startsWith("/login") || pathname.startsWith("/setup");
    if (context.locals.user && onAuthPage) return context.redirect("/");
  }

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
