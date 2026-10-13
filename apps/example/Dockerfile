FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.34.4 --activate

WORKDIR /app
COPY . .
ARG VITE_EXTERIOR_URL
ENV VITE_EXTERIOR_URL=$VITE_EXTERIOR_URL
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @exterior/example... build

FROM nginx:1.27-alpine
COPY apps/example/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/example/dist /usr/share/nginx/html
EXPOSE 80
