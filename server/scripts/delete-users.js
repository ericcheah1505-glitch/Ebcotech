// Deletes staff accounts by username – for test accounts that have no history.
// Anyone with jobs, reports, photos or incentive history is skipped (switch them to inactive in the app instead),
// and admin accounts are never deleted here. Saves a backup copy of the database first.
// Usage: node scripts/delete-users.js              (lists the accounts)
//        node scripts/delete-users.js tech1 sales1 (deletes those)
import { openDb } from '../src/db.js';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR || 'data');
const file = path.join(dataDir, 'autodoor.db');
const db = openDb(file);
const names = process.argv.slice(2).map((n) => n.trim().toLowerCase()).filter(Boolean);

// Everywhere a person can appear on a record.
const USES = [
  ['jobs', 'salesman_id'], ['jobs', 'created_by'], ['jobs', 'submitted_by'],
  ['job_technicians', 'user_id'], ['job_extras', 'technician_id'], ['job_extras', 'created_by'],
  ['incentive_adjustments', 'technician_id'], ['incentive_adjustments', 'created_by'],
  ['job_photos', 'uploaded_by'], ['job_logs', 'user_id'],
  ['warranty_followups', 'contacted_by'], ['warranty_followups', 'updated_by'],
];
const usedBy = (id) => USES.reduce((n, [t, c]) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${c} = ?`).get(id).n, 0);

const users = db.prepare('SELECT id, name, username, role, active FROM users ORDER BY id').all();
if (!names.length) {
  console.log('Accounts:');
  for (const u of users) console.log(`  ${u.username.padEnd(14)} ${u.role.padEnd(10)} ${u.name}${u.active ? '' : '  (inactive)'}  – ${usedBy(u.id)} record(s)`);
  console.log('\nTo delete: node scripts/delete-users.js username1 username2');
  process.exit(0);
}

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const backup = path.join(dataDir, `autodoor-before-delete-users-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.db`);
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`Backup saved: ${backup}`);

for (const name of names) {
  const u = users.find((x) => x.username.toLowerCase() === name);
  if (!u) console.log(`- ${name}: no such account`);
  else if (u.role === 'admin') console.log(`- ${name}: admin accounts are not deleted here`);
  else if (usedBy(u.id) > 0) console.log(`- ${name}: has jobs or history – not deleted (switch to inactive in More > Staff)`);
  else {
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id); // their login sessions go with them
    console.log(`- ${name}: deleted`);
  }
}
db.close();
fs.existsSync(backup) || console.log('(backup file missing?)');
