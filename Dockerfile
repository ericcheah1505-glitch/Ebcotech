# Ebcotech system for Railway (or any Docker host): builds the website, then runs the Node server
# that serves it together with the API, PDF reports (headless Chrome) and Excel exports.
# Data (database + photos) lives on a persistent volume mounted at /data.

# ---- 1. Build the website (static files in web/out) ----
FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- 2. Server ----
FROM node:24-bookworm-slim
# What the PDF engine (headless Chrome) needs, plus fonts – including Chinese for 德科德機械有限公司.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 \
      libnss3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 \
      fonts-liberation fonts-noto-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=Asia/Kuala_Lumpur \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    WEB_DIR=/app/web/out \
    PUPPETEER_CACHE_DIR=/app/.puppeteer

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY server/assets ./assets
COPY server/scripts ./scripts
COPY --from=web /web/out /app/web/out

# Railway sets PORT; 4000 when run elsewhere.
EXPOSE 4000
CMD ["node", "src/index.js"]
