# 前端构建阶段
FROM node:20-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 生产运行阶段：Express 同时提供 API 和前端静态文件
FROM node:20-alpine

ARG APP_VERSION=1.0.0
LABEL org.opencontainers.image.title="PortHub" \
      org.opencontainers.image.version="$APP_VERSION"

WORKDIR /app
RUN apk add --no-cache lsof

COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PM_PORT=9000

RUN mkdir -p /app/server/data && chown -R node:node /app
USER node

VOLUME ["/app/server/data"]
EXPOSE 9000
CMD ["node", "server/index.js"]
