# The scanner API: a small Node process that streams uploads to clamd.
# clamd and freshclam run in the official clamav/clamav image next to it
# (docker-compose.yml). No npm dependencies, so there is no install step.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY package.json ./
COPY src ./src

# The node image's unprivileged user. The API never writes to disk.
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "src/healthcheck.js"]

CMD ["node", "src/server.js"]
