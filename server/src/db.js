import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');

export function openDb(file = path.join(DATA_DIR, 'autodoor.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  migrate(db);
  seed(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','salesman','technician')),
      grade TEXT CHECK (grade IN ('senior','junior')),
      phone TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Job types carry the warranty period and base incentive per technician grade.
    CREATE TABLE IF NOT EXISTS job_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      warranty_months INTEGER NOT NULL DEFAULT 0,
      senior_rate REAL NOT NULL DEFAULT 0,
      junior_rate REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- Extra situations (welding, after-hours, outstation...) that add incentive on top of base.
    CREATE TABLE IF NOT EXISTS extra_items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      unit TEXT NOT NULL DEFAULT 'job',
      senior_amount REAL NOT NULL DEFAULT 0,
      junior_amount REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS service_contracts (
      id INTEGER PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      address TEXT,
      job_type_id INTEGER NOT NULL REFERENCES job_types(id),
      interval_months INTEGER NOT NULL DEFAULT 3,
      start_date TEXT NOT NULL,
      end_date TEXT,
      next_service_date TEXT NOT NULL,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      job_no TEXT UNIQUE,
      job_type_id INTEGER NOT NULL REFERENCES job_types(id),
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      address TEXT,
      description TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','assigned','in_progress','kiv','completed','cancelled')),
      kiv_reason TEXT,
      kiv_follow_up_date TEXT,
      salesman_id INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      contract_id INTEGER REFERENCES service_contracts(id),
      contract_due_date TEXT,
      started_at TEXT,
      completed_at TEXT,
      warranty_months INTEGER,
      warranty_end TEXT,
      work_done TEXT,
      remarks TEXT,
      customer_sign_name TEXT,
      customer_signature TEXT,
      salesman_signature TEXT,
      salesman_signed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS job_technicians (
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      -- Grade frozen when the job completes, so later promotions don't change past incentive.
      grade TEXT,
      PRIMARY KEY (job_id, user_id)
    );

    -- Extras recorded on a job; technician_id NULL means it applies to every technician on the job.
    CREATE TABLE IF NOT EXISTS job_extras (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      extra_item_id INTEGER NOT NULL REFERENCES extra_items(id),
      technician_id INTEGER REFERENCES users(id),
      qty REAL NOT NULL DEFAULT 1,
      note TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Manual +/- adjustments for one-off special cases that no rule covers.
    CREATE TABLE IF NOT EXISTS incentive_adjustments (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      technician_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS job_photos (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      caption TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Follow-up of customers whose warranty is ending, keyed by the job that gave the warranty.
    -- new / contacted / quoted / callback (call back on callback_date) / declined (reason in note) /
    -- booked (a servicing job or service contract was made from the follow-up).
    CREATE TABLE IF NOT EXISTS warranty_followups (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','contacted','quoted','callback','declined','booked')),
      note TEXT,
      callback_date TEXT,
      contacted_at TEXT,
      contacted_by INTEGER REFERENCES users(id),
      booked_job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      booked_contract_id INTEGER REFERENCES service_contracts(id) ON DELETE SET NULL,
      updated_at TEXT,
      updated_by INTEGER REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_date ON jobs(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  `);

  // Columns added after the first release.
  addColumn(db, 'jobs', 'under_warranty', 'INTEGER NOT NULL DEFAULT 0'); // warranty claim: no incentive
  addColumn(db, 'jobs', 'incentive_cap', 'REAL'); // per-job override of the job type's cap
  addColumn(db, 'job_types', 'incentive_cap', 'REAL'); // max total base incentive per job, split equally
  // Service report fields (matching the paper SERVICE REPORT form).
  addColumn(db, 'jobs', 'product_model', 'TEXT'); // HH150 EASY, HH100, ... or free text
  addColumn(db, 'jobs', 'product_variant', 'TEXT'); // SINGLE / DOUBLE door, for models that have both
  addColumn(db, 'jobs', 'product_brand', 'TEXT'); // GEWALT (house brand) or free text
  addColumn(db, 'jobs', 'inv_do_no', 'TEXT');
  addColumn(db, 'jobs', 'site_contact', 'TEXT');
  addColumn(db, 'jobs', 'owner_name', 'TEXT');
  addColumn(db, 'jobs', 'outstation', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'jobs', 'night_work', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'jobs', 'accessories', 'TEXT'); // JSON, see mobile/src/lib/catalog.ts
  addColumn(db, 'jobs', 'customer_comment', 'TEXT');
  addColumn(db, 'jobs', 'technician_signature', 'TEXT');
  addColumn(db, 'sessions', 'last_used_at', 'TEXT'); // for login expiry after days without use
  // Set when admin gives a temporary password; the person must choose their own at next login.
  addColumn(db, 'users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'job_photos', 'stage', 'TEXT'); // 'before' (on arrival) or 'after' (work finished)
  // Technician's job report, waiting for the salesman to mark the job as done.
  addColumn(db, 'jobs', 'submitted_at', 'TEXT');
  addColumn(db, 'jobs', 'submitted_by', 'INTEGER REFERENCES users(id)');

  // Company rule (Oct 2026): servicing has a 3-month warranty (1 year when a controller or motor is
  // replaced – chosen on the job). Changes the old 1-month default once; later admin edits are kept.
  if (!db.prepare(`SELECT 1 FROM settings WHERE key = 'migrated_service_warranty_3m'`).get()) {
    db.exec(`
      UPDATE job_types SET warranty_months = 3 WHERE name = 'Servicing / Maintenance' AND warranty_months = 1;
      INSERT INTO settings (key, value) VALUES ('migrated_service_warranty_3m', '1');
    `);
  }

  // Model names renamed in Oct 2026 (EASY -> HH150 EASY, ...); single/double became its own field.
  db.exec(`
    UPDATE jobs SET product_model = 'HH150 EASY' WHERE product_model = 'EASY';
    UPDATE jobs SET product_model = 'HH150 PREMIUM' WHERE product_model = 'PREMIUM';
    UPDATE jobs SET product_model = 'FW8900' WHERE product_model = '8900';
    UPDATE jobs SET product_model = 'HH150', product_variant = COALESCE(product_variant, 'SINGLE') WHERE product_model = 'HH150 SINGLE';
    UPDATE jobs SET product_model = 'HH150', product_variant = COALESCE(product_variant, 'DOUBLE') WHERE product_model = 'HH150 DOUBLE';
  `);
}

function addColumn(db, table, column, definition) {
  const exists = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const addUser = db.prepare(
    'INSERT INTO users (name, username, password_hash, role, grade) VALUES (?, ?, ?, ?, ?)'
  );
  addUser.run('Administrator', 'admin', hashPassword('admin123'), 'admin', null);
  addUser.run('Sample Salesman', 'sales1', hashPassword('sales123'), 'salesman', null);
  addUser.run('Senior Tech', 'tech1', hashPassword('tech123'), 'technician', 'senior');
  addUser.run('Junior Tech', 'tech2', hashPassword('tech123'), 'technician', 'junior');

  // Company rates (Oct 2026). Repair rate is a placeholder until confirmed.
  // Inspection is done by the salesman, so it pays no technician incentive.
  const addType = db.prepare(
    'INSERT INTO job_types (name, warranty_months, senior_rate, junior_rate) VALUES (?, ?, ?, ?)'
  );
  addType.run('Installation', 12, 60, 40);
  db.prepare("UPDATE job_types SET incentive_cap = 200 WHERE name = 'Installation'").run(); // RM200 shared limit per job
  addType.run('Repair / Breakdown', 3, 30, 20);
  addType.run('Servicing / Maintenance', 3, 30, 20); // 1 year when a controller or motor is replaced
  addType.run('Inspection / Survey', 0, 0, 0);

  const addExtra = db.prepare(
    'INSERT INTO extra_items (name, unit, senior_amount, junior_amount, active) VALUES (?, ?, ?, ?, ?)'
  );
  addExtra.run('Welding work', 'person', 150, 150, 1);
  addExtra.run('Night job / Overtime', 'job', 0, 0, 0); // rate to be decided
}
