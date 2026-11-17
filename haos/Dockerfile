FROM node:24-alpine AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY app/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/integrations ./integrations
COPY --from=build /app/server.mjs ./
ENV NODE_ENV=production PORT=8099 HA_INGRESS=1 CALENDAR_STORE=/data/connections.json TZ=Europe/Stockholm
EXPOSE 8099
CMD ["node", "server.mjs"]
