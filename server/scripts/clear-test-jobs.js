// Deletes ALL jobs (with their reports, signatures, photos, extras, adjustments, history) and all service
// contracts, keeping staff accounts, job types/rates, extra situations and settings.
// Meant for clearing test data before going live. Saves a backup copy first.
// Usage: node scripts/clear-test-jobs.js --yes
import { openDb } from '../src/db.js';
import fs from 'node:fs';
import path from 'node:path';

if (!process.argv.includes('--yes')) {
  console.error('This deletes every job and service contract. Run again with --yes to confirm.');
  process.exit(1);
}
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
const file = path.join(dataDir, 'autodoor.db');
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const backup = path.join(dataDir, `autodoor-before-clear-${stamp}.db`);

const db = openDb(file); // also brings an older database up to the current layout
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`Backup saved: ${backup}`);

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const before = { jobs: count('jobs'), contracts: count('service_contracts') };
db.exec(`
  BEGIN;
  DELETE FROM job_photos;
  DELETE FROM job_logs;
  DELETE FROM incentive_adjustments;
  DELETE FROM job_extras;
  DELETE FROM job_technicians;
  DELETE FROM jobs;
  DELETE FROM service_contracts;
  COMMIT;
`);
db.exec('VACUUM');
db.close();
// Photo files go too (the database backup above doesn't contain them; they are test photos).
fs.rmSync(path.join(dataDir, 'photos'), { recursive: true, force: true });
console.log(`Deleted ${before.jobs} job(s) and ${before.contracts} service contract(s). Staff, rates and settings kept.`);
