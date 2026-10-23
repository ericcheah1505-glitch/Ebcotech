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
FROM node:24-trixie-slim
# Chromium for the PDF reports comes from Debian's own package repository (with all the libraries it
# needs) instead of being downloaded by puppeteer: that download only printed a warning when it failed,
# which once left a live server that could not make PDFs. `chromium --version` fails the build if it is
# not installed. Fonts: Liberation (Arial look), DejaVu (the tick mark in the report's boxes) and Noto
# including Chinese for the company name 德科德機械有限公司.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates chromium fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && chromium --version

ENV NODE_ENV=production \
    TZ=Asia/Kuala_Lumpur \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    WEB_DIR=/app/web/out \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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
