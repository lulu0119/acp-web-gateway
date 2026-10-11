FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.34.4 --activate

WORKDIR /app
COPY . .
ARG VITE_MUKAE_URL
ENV VITE_MUKAE_URL=$VITE_MUKAE_URL
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mukae/example... build

FROM nginx:1.27-alpine
COPY apps/example/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/example/dist /usr/share/nginx/html
EXPOSE 80
