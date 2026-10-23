import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { generateContractJobs } from './automation.js';

const PORT = Number(process.env.PORT || 4000);
// On the cloud server HOST=127.0.0.1 so only Caddy (HTTPS) can reach it; on the laptop phones connect directly.
const HOST = process.env.HOST || '0.0.0.0';
const db = openDb();
const app = createApp(db);

// The website (web/out, built with `npm run build` in web/) is served from the same server, so
// staff just open the server's address in their browser.
const WEB_DIR = process.env.WEB_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'out');
if (fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR, { extensions: ['html'], maxAge: '1h' }));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.status(404).sendFile(path.join(WEB_DIR, '404.html')) : next()));
} else {
  console.warn(`Website not built yet (${WEB_DIR} missing) – only the API is available.`);
}

// Service-contract automation: create due servicing jobs when the server starts, and again whenever
// someone opens the Today page (see app.js) – no timer, so the host can sleep when nobody uses it.
try {
  const created = generateContractJobs(db);
  if (created.length) console.log(`Created ${created.length} contract servicing job(s)`);
} catch (e) {
  console.error('Automation failed', e);
}

app.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log(`Ebcotech Autodoor server running on port ${PORT}`);
  console.log(`Open the website at: ${lan.join('  ') || `http://localhost:${PORT}`} (this computer: http://localhost:${PORT})`);
});
