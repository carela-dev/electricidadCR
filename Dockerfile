# ---------- build del frontend ----------
FROM node:20-alpine AS web-build
WORKDIR /build
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN npm install --prefix server --omit=dev

COPY server ./server
COPY --from=web-build /build/dist ./web/dist

# Volumen recomendado para conservar el historial NDJSON:
#   docker run -v tuya-data:/app/server/data ...
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/src/index.js"]
