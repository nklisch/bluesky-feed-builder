FROM node:20.9-alpine3.18 AS deps
LABEL description="Bluesky Trending Feed"

WORKDIR /app
COPY package*.json ./
COPY yarn.lock ./
RUN apk add --no-cache yarn
RUN yarn install --frozen-lockfile

##### BUILDER
FROM node:20.9-alpine3.18 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN SKIP_ENV_VALIDATION=1 yarn build
RUN yarn install --production --frozen-lockfile

##### RUNNER
FROM node:20.9-alpine3.18 AS runner
WORKDIR /app
ENV FEEDGEN_LISTENHOST="localhost"
ENV FEEDGEN_PORT=${FEEDGEN_PORT:-9000}

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
COPY --from=builder --chown=nodejs:nodejs /app/dist ./server
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh
USER nodejs
EXPOSE $FEEDGEN_PORT
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server/index.js"]