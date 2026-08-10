FROM node:24-slim AS base
RUN npm install -g pnpm@10.33.0 turbo@2
WORKDIR /app

FROM base AS pruner
COPY . .
RUN turbo prune @r0ute/bot --docker

FROM base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run generate

ENV NODE_ENV=production
ENV DEVICE=/dev/ttyUSB0

USER node

CMD ["sh", "-c", "pnpm --filter @r0ute/database migrate:deploy && pnpm --filter @r0ute/bot start"]
