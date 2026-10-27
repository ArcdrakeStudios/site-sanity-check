FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /app
COPY --chown=node:node hosted-server.mjs ./
COPY --chown=node:node src/ ./src/
USER node
ENV NODE_ENV=production PORT=43148 SCANNER_LISTEN_HOST=0.0.0.0
EXPOSE 43148
CMD ["node", "--max-old-space-size=96", "hosted-server.mjs"]
