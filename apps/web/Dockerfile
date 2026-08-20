# syntax=docker/dockerfile:1

FROM node:24-slim AS base
RUN npm install -g pnpm@10.33.0 turbo@2
WORKDIR /app

# prune the workspace down to @r0ute/web and its workspace dependencies
FROM base AS pruner
COPY . .
RUN turbo prune @r0ute/web --docker

FROM base AS build
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# next build imports the db module; the real URL is provided at runtime
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm turbo run build --filter=@r0ute/web

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
