// Writes a clean single-file copy of the database (safe to copy while the server runs).
// Usage: node scripts/export-db.js <output file>
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/export-db.js <output file>');
  process.exit(1);
}
const src = path.resolve(process.env.DATA_DIR || 'data', 'autodoor.db');
fs.rmSync(out, { force: true });
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${path.resolve(out).replace(/'/g, "''")}'`);
db.close();
console.log(`Copied ${src} -> ${out}`);
