# syntax=docker/dockerfile:1

FROM node:24-slim AS base
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DEVICE=/dev/ttyUSB0
ENV DB_PATH=/data/r0ute.db

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir /data && chown node:node /data
VOLUME /data

# serial access needs the host's dialout group — add it via compose `group_add`
USER node

CMD ["node", "dist/index.js"]