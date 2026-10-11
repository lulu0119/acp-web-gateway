FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.34.4 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mukae/relay... build

ENV HOST=0.0.0.0
ENV PORT=8787
WORKDIR /app/apps/relay
EXPOSE 8787
CMD ["node", "dist/main.js"]
