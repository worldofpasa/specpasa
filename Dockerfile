# Node deploy target — the default self-host image (docs/architecture.md
# ADR-2). Local CLI and Ollama detection require this runtime; the optional
# Cloudflare Workers target is deployed separately via wrangler.
FROM node:22-alpine AS build
RUN npm install -g pnpm@11
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @specpasa/web build

FROM node:22-alpine AS runtime
RUN npm install -g pnpm@11
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=build /app /app
RUN mkdir -p /app/data
EXPOSE 4321
CMD ["node", "apps/web/dist/server/entry.mjs"]
