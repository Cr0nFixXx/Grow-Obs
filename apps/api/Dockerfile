# Separate tools/runtime targets; migrations and seeds are never generated at server startup.
FROM node:22-bookworm-slim AS tools
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=tools /app/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY --from=tools --chown=node:node /app/dist ./dist
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
