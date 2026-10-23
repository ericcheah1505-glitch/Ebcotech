import express from 'express';
import cors from 'cors';
import { authMiddleware, hashPassword, newToken, requireRole, verifyPassword } from './auth.js';
import {
  assignJobNo,
  completeJob,
  generateContractJobs,
  generateContractJobsIfDue,
  JOB_LIST_SQL,
  logJob,
  COMPLETION_FIELDS,
  POSTING_FIELDS,
  reminders,
  setReportFields,
} from './automation.js';
import { incentiveReport, jobIncentive } from './incentive.js';
import { installedSummary } from './reports.js';
import { getSettings, idleLabel, saveSettings } from './settings.js';
import { previewHtml, reportHtml, reportPdf } from './report.js';
import { incentiveWorkbook, installedWorkbook, jobsWorkbook } from './exports.js';
import { isValidDate, nowStamp, today } from './dates.js';
import fs from 'node:fs';
import path from 'node:path';
import { decodeImage, MAX_PHOTOS_PER_JOB, mimeFor, photoPath, removePhotoFile, savePhotoFile } from './photos.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (e) {
    next(e);
  }
};
// For handlers that send files (PDF, Excel) and need to await.
const wrapAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const sendFile = (res, buffer, type, fileName) => {
  res.set('Content-Type', type);
  res.set('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(buffer);
};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STAFF = ['admin', 'salesman'];

export function createApp(db, { photosDir = path.resolve(process.env.DATA_DIR || 'data', 'photos') } = {}) {
  const loginGuard = createLoginGuard();
  const app = express();
  app.set('trust proxy', 'loopback'); // behind Caddy on the cloud server, so req.ip is the phone's address
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, time: nowStamp() }));

  app.post(
    '/api/login',
    wrap((req) => {
      const { username, password } = req.body || {};
      const name = String(username || '').trim().toLowerCase();
      const attemptKey = `${req.ip}|${name}`;
      if (loginGuard.blocked(attemptKey)) fail(429, 'Too many wrong passwords. Please wait 15 minutes and try again.');
      const user = db.prepare('SELECT * FROM users WHERE lower(username) = ? AND active = 1').get(name);
      if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
        loginGuard.failed(attemptKey);
        fail(401, 'Wrong username or password');
      }
      loginGuard.reset(attemptKey);
      const token = newToken();
      db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
      return { token, user: publicUser(user) };
    })
  );

  const auth = authMiddleware(db, { idleMinutes: () => Number(getSettings(db).session_idle_minutes), idleLabel });

  app.use('/api', auth);

  app.post(
    '/api/logout',
    wrap((req) => {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
      return { ok: true };
    })
  );

  app.get('/api/me', wrap((req) => req.user));

  // Everyone sets their own password; admin only gives temporary ones. Logs out the person's
  // other phones, keeping this one.
  app.post(
    '/api/me/password',
    wrap((req) => {
      const { current_password, new_password } = req.body || {};
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!verifyPassword(String(current_password || ''), u.password_hash)) fail(400, 'Current password is wrong');
      checkPassword(new_password);
      if (verifyPassword(String(new_password), u.password_hash)) fail(400, 'Choose a password different from the current one');
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(new_password), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, req.token);
      return { ok: true };
    })
  );

  // Until a temporary password is changed, that is the only thing the person can do.
  app.use('/api', (req, res, next) => {
    if (!req.user.must_change_password) return next();
    const allowed = ['/me', '/me/password', '/logout', '/settings'];
    if (allowed.includes(req.path)) return next();
    res.status(403).json({ error: 'Please change your temporary password first.' });
  });

  // ---------- Users ----------
  app.get(
    '/api/users',
    wrap((req) => {
      const rows = db.prepare('SELECT * FROM users ORDER BY role, name').all();
      const visible = req.user.role === 'admin' ? rows : rows.filter((u) => u.active);
      return visible.map(publicUser);
    })
  );

  app.post(
    '/api/users',
    requireRole('admin'),
    wrap((req) => {
      const { name, username, password, role, grade, phone } = req.body || {};
      if (!name || !username || !password || !role) fail(400, 'Name, username, password and role are required');
      if (role === 'technician' && !['senior', 'junior'].includes(grade)) fail(400, 'Technician grade must be senior or junior');
      checkPassword(password);
      // The password admin types is temporary: the person must change it at first login.
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (name, username, password_hash, role, grade, phone, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)')
        .run(name, username.trim(), hashPassword(password), role, role === 'technician' ? grade : null, phone || null);
      return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid));
    })
  );

  app.put(
    '/api/users/:id',
    requireRole('admin'),
    wrap((req) => {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) || fail(404, 'User not found');
      const b = { ...u, ...req.body };
      // Never leave the company without an active admin (nobody could manage staff any more).
      const losesAdmin = u.role === 'admin' && u.active && (b.role !== 'admin' || !b.active);
      if (losesAdmin) {
        const others = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(u.id).n;
        if (!others) fail(400, `${u.name} is the only admin. Make another person admin first.`);
      }
      db.prepare('UPDATE users SET name = ?, role = ?, grade = ?, phone = ?, active = ? WHERE id = ?').run(
        b.name,
        b.role,
        b.role === 'technician' ? b.grade || 'junior' : null,
        b.phone || null,
        b.active ? 1 : 0,
        u.id
      );
      if (req.body.password) {
        checkPassword(req.body.password);
        // A reset by admin is a temporary password (except admin resetting their own).
        const own = u.id === req.user.id;
        db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(hashPassword(req.body.password), own ? 0 : 1, u.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, own ? req.token : '');
      }
      if (!b.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id));
    })
  );

  // Lost or stolen phone: log this person out everywhere (they can log in again on a new phone).
  app.post(
    '/api/users/:id/logout-all',
    requireRole('admin'),
    wrap((req) => {
      const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id) || fail(404, 'User not found');
      const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      return { logged_out: Number(changes) };
    })
  );

  // Someone leaving: their unfinished jobs, so admin can move them to another person in one step.
  // Technician: open jobs they are on that they have NOT submitted a report for (submitted work stays
  // theirs – it decides their incentive). Salesman: open jobs where they are the salesman.
  const OPEN = `j.status IN ('pending','assigned','in_progress','kiv')`;
  const leaverJobs = (u) =>
    u.role === 'technician'
      ? db
          .prepare(
            `SELECT j.id, j.job_no, j.customer_name FROM jobs j JOIN job_technicians x ON x.job_id = j.id
             WHERE x.user_id = ? AND ${OPEN} AND j.submitted_at IS NULL ORDER BY j.id`
          )
          .all(u.id)
      : db.prepare(`SELECT j.id, j.job_no, j.customer_name FROM jobs j WHERE j.salesman_id = ? AND ${OPEN} ORDER BY j.id`).all(u.id);

  app.get(
    '/api/users/:id/open-jobs',
    requireRole('admin'),
    wrap((req) => {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) || fail(404, 'User not found');
      return { jobs: leaverJobs(u) };
    })
  );

  app.post(
    '/api/users/:id/move-open-jobs',
    requireRole('admin'),
    wrap((req) => {
      const from = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) || fail(404, 'User not found');
      const to = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.body?.to_user_id) || fail(400, 'Choose an active person to move the jobs to');
      if (to.id === from.id) fail(400, 'Choose a different person');
      const ok = from.role === 'technician' ? to.role === 'technician' : ['salesman', 'admin'].includes(to.role);
      if (!ok) fail(400, from.role === 'technician' ? 'Move technician jobs to another technician' : 'Move salesman jobs to a salesman or admin');
      const jobs = leaverJobs(from);
      const note = `Moved from ${from.name} to ${to.name}`;
      db.exec('BEGIN');
      try {
        for (const j of jobs) {
          if (from.role === 'technician') {
            db.prepare('DELETE FROM job_technicians WHERE job_id = ? AND user_id = ?').run(j.id, from.id);
            db.prepare('INSERT OR IGNORE INTO job_technicians (job_id, user_id) VALUES (?, ?)').run(j.id, to.id);
            // Extras claimed by the leaver for themselves follow the job to the new technician.
            db.prepare('UPDATE job_extras SET technician_id = ? WHERE job_id = ? AND technician_id = ?').run(to.id, j.id, from.id);
          } else {
            db.prepare('UPDATE jobs SET salesman_id = ? WHERE id = ?').run(to.id, j.id);
          }
          logJob(db, j.id, req.user.id, 'reassigned', note);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return { moved: jobs.length };
    })
  );

  // ---------- Job types & extra situations (rates) ----------
  app.get('/api/job-types', wrap(() => db.prepare('SELECT * FROM job_types ORDER BY id').all()));
  app.post(
    '/api/job-types',
    requireRole('admin'),
    wrap((req) => {
      const b = req.body || {};
      if (!b.name) fail(400, 'Name is required');
      const { lastInsertRowid } = db
        .prepare('INSERT INTO job_types (name, warranty_months, senior_rate, junior_rate, incentive_cap) VALUES (?, ?, ?, ?, ?)')
        .run(b.name, num(b.warranty_months), num(b.senior_rate), num(b.junior_rate), optNum(b.incentive_cap));
      return db.prepare('SELECT * FROM job_types WHERE id = ?').get(lastInsertRowid);
    })
  );
  app.put(
    '/api/job-types/:id',
    requireRole('admin'),
    wrap((req) => {
      const t = db.prepare('SELECT * FROM job_types WHERE id = ?').get(req.params.id) || fail(404, 'Not found');
      const b = { ...t, ...req.body };
      db.prepare('UPDATE job_types SET name = ?, warranty_months = ?, senior_rate = ?, junior_rate = ?, incentive_cap = ?, active = ? WHERE id = ?').run(
        b.name,
        num(b.warranty_months),
        num(b.senior_rate),
        num(b.junior_rate),
        optNum(b.incentive_cap),
        b.active ? 1 : 0,
        t.id
      );
      return db.prepare('SELECT * FROM job_types WHERE id = ?').get(t.id);
    })
  );

  app.get('/api/extra-items', wrap(() => db.prepare('SELECT * FROM extra_items ORDER BY id').all()));
  app.post(
    '/api/extra-items',
    requireRole('admin'),
    wrap((req) => {
      const b = req.body || {};
      if (!b.name) fail(400, 'Name is required');
      const { lastInsertRowid } = db
        .prepare('INSERT INTO extra_items (name, unit, senior_amount, junior_amount) VALUES (?, ?, ?, ?)')
        .run(b.name, b.unit || 'job', num(b.senior_amount), num(b.junior_amount));
      return db.prepare('SELECT * FROM extra_items WHERE id = ?').get(lastInsertRowid);
    })
  );
  app.put(
    '/api/extra-items/:id',
    requireRole('admin'),
    wrap((req) => {
      const t = db.prepare('SELECT * FROM extra_items WHERE id = ?').get(req.params.id) || fail(404, 'Not found');
      const b = { ...t, ...req.body };
      db.prepare('UPDATE extra_items SET name = ?, unit = ?, senior_amount = ?, junior_amount = ?, active = ? WHERE id = ?').run(
        b.name,
        b.unit || 'job',
        num(b.senior_amount),
        num(b.junior_amount),
        b.active ? 1 : 0,
        t.id
      );
      return db.prepare('SELECT * FROM extra_items WHERE id = ?').get(t.id);
    })
  );

  // ---------- Jobs ----------
  const listJobs = (req, limit = 300) => {
      const { status, date, from, to, q, technician_id, salesman_id, job_type_id, done_from, done_to } = req.query;
      const where = [];
      const params = [];
      if (status) {
        const list = String(status).split(',');
        where.push(`j.status IN (${list.map(() => '?').join(',')})`);
        params.push(...list);
      }
      for (const [value, clause] of [
        [date, 'j.scheduled_date = ?'],
        [from, 'j.scheduled_date >= ?'],
        [to, 'j.scheduled_date <= ?'],
      ]) {
        if (!value) continue;
        where.push(clause);
        params.push(value);
      }
      if (q) {
        // INV/DO numbers match ignoring case, spaces and dashes ("cs 003984" finds "CS-003984").
        const compact = String(q).toUpperCase().replace(/[\s-]/g, '');
        where.push(
          `(j.customer_name LIKE ? OR j.job_no LIKE ? OR j.address LIKE ?
            OR REPLACE(REPLACE(UPPER(COALESCE(j.inv_do_no, '')), '-', ''), ' ', '') LIKE ?)`
        );
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${compact}%`);
      }
      // Office table filters
      if (technician_id) {
        where.push('EXISTS (SELECT 1 FROM job_technicians x WHERE x.job_id = j.id AND x.user_id = ?)');
        params.push(Number(technician_id));
      }
      if (salesman_id) {
        where.push('j.salesman_id = ?');
        params.push(Number(salesman_id));
      }
      if (job_type_id) {
        where.push('j.job_type_id = ?');
        params.push(Number(job_type_id));
      }
      if (done_from) {
        where.push('substr(j.completed_at, 1, 10) >= ?');
        params.push(done_from);
      }
      if (done_to) {
        where.push('substr(j.completed_at, 1, 10) <= ?');
        params.push(done_to);
      }
      if (req.user.role === 'technician') {
        where.push('EXISTS (SELECT 1 FROM job_technicians x WHERE x.job_id = j.id AND x.user_id = ?)');
        params.push(req.user.id);
      }
      const sql = `${JOB_LIST_SQL}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
        ORDER BY COALESCE(j.scheduled_date, '9999') ${date || from ? 'ASC' : 'DESC'}, j.scheduled_time, j.id DESC LIMIT ${limit}`;
      return db.prepare(sql).all(...params);
  };

  app.get(
    '/api/jobs',
    wrap((req) => listJobs(req))
  );

  app.get(
    '/api/export/jobs.xlsx',
    requireRole(...STAFF),
    wrapAsync(async (req, res) => sendFile(res, await jobsWorkbook(listJobs(req, 5000)), XLSX, `Jobs-${today()}.xlsx`))
  );

  // Finds earlier completed jobs for the same customer or address that are still under warranty,
  // so staff can flag a new job as a warranty case (no incentive).
  app.get(
    '/api/jobs/warranty-check',
    requireRole(...STAFF),
    wrap((req) => {
      const customer = String(req.query.customer || '').trim();
      const address = String(req.query.address || '').trim();
      const onDate = isValidDate(req.query.date) ? req.query.date : today();
      if (!customer && !address) return [];
      return db
        .prepare(
          `SELECT j.id, j.job_no, j.customer_name, j.address, j.completed_at, j.warranty_end, jt.name AS job_type
           FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id
           WHERE j.status = 'completed' AND j.warranty_end >= ? AND j.id != ?
             AND ((? != '' AND lower(trim(j.customer_name)) = lower(?)) OR (? != '' AND lower(trim(j.address)) = lower(?)))
           ORDER BY j.warranty_end DESC LIMIT 5`
        )
        .all(onDate, Number(req.query.exclude) || 0, customer, customer, address, address);
    })
  );

  app.get('/api/jobs/:id', wrap((req) => jobDetail(db, loadJob(db, req), req.user)));

  app.post(
    '/api/jobs',
    requireRole(...STAFF),
    wrap((req) => {
      const b = req.body || {};
      validateJob(b);
      const techIds = (b.technician_ids || []).map(Number);
      const status = techIds.length ? 'assigned' : 'pending';
      const salesmanId = b.salesman_id || (req.user.role === 'salesman' ? req.user.id : null);
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO jobs (job_type_id, customer_name, customer_phone, address, description, scheduled_date,
             scheduled_time, status, salesman_id, created_by, under_warranty, incentive_cap)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          b.job_type_id,
          b.customer_name,
          b.customer_phone || null,
          b.address || null,
          b.description || null,
          b.scheduled_date || null,
          b.scheduled_time || null,
          status,
          salesmanId,
          req.user.id,
          b.under_warranty ? 1 : 0,
          req.user.role === 'admin' ? optNum(b.incentive_cap) : null
        );
      const id = Number(lastInsertRowid);
      assignJobNo(db, id);
      setTechnicians(db, id, techIds);
      setReportFields(db, id, b, POSTING_FIELDS);
      logJob(db, id, req.user.id, 'created');
      return jobDetail(db, db.prepare('SELECT * FROM jobs WHERE id = ?').get(id), req.user);
    })
  );

  app.put(
    '/api/jobs/:id',
    requireRole(...STAFF),
    wrap((req) => {
      const job = loadJob(db, req);
      const b = { ...job, ...req.body };
      validateJob(b);
      db.prepare(
        `UPDATE jobs SET job_type_id = ?, customer_name = ?, customer_phone = ?, address = ?, description = ?,
           scheduled_date = ?, scheduled_time = ?, salesman_id = ?, warranty_months = ?, under_warranty = ?,
           incentive_cap = ?, updated_at = ? WHERE id = ?`
      ).run(
        b.job_type_id,
        b.customer_name,
        b.customer_phone || null,
        b.address || null,
        b.description || null,
        b.scheduled_date || null,
        b.scheduled_time || null,
        b.salesman_id || null,
        b.warranty_months === '' || b.warranty_months == null ? null : num(b.warranty_months),
        b.under_warranty ? 1 : 0,
        req.user.role === 'admin' ? optNum(b.incentive_cap) : job.incentive_cap,
        nowStamp(),
        job.id
      );
      if (Array.isArray(req.body.technician_ids)) {
        const ids = req.body.technician_ids.map(Number);
        setTechnicians(db, job.id, ids);
        if (job.status === 'pending' && ids.length) {
          db.prepare(`UPDATE jobs SET status = 'assigned' WHERE id = ?`).run(job.id);
        } else if (job.status === 'assigned' && !ids.length) {
          db.prepare(`UPDATE jobs SET status = 'pending' WHERE id = ?`).run(job.id);
        }
      }
      setReportFields(db, job.id, req.body, POSTING_FIELDS);
      logJob(db, job.id, req.user.id, 'edited');
      return jobDetail(db, db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id), req.user);
    })
  );

  // Status changes. Technicians: start, KIV, complete. Staff additionally: re-open KIV, cancel.
  app.post(
    '/api/jobs/:id/status',
    wrap((req) => {
      const job = loadJob(db, req);
      const b = req.body || {};
      const role = req.user.role;
      const to = b.status;
      // Technicians can't mark a job as done; they submit a job report (below) for the salesman.
      const techAllowed = ['in_progress', 'kiv'];
      const staffAllowed = ['pending', 'assigned', 'in_progress', 'kiv', 'completed', 'cancelled'];
      if (!(role === 'technician' ? techAllowed : staffAllowed).includes(to)) fail(403, `You cannot set status to ${to}`);
      if (job.status === 'completed' && role !== 'admin') fail(400, 'Job is already completed');

      const stamp = nowStamp();
      if (to === 'completed') {
        if (!job.salesman_signature) fail(400, 'The salesman must sign the report before the job can be marked as done');
        completeJob(db, job.id, req.user.id, b);
      } else if (to === 'kiv') {
        if (!b.kiv_reason) fail(400, 'Please give the KIV reason (what are we waiting for?)');
        if (b.kiv_follow_up_date && !isValidDate(b.kiv_follow_up_date)) fail(400, 'Follow-up date must be YYYY-MM-DD');
        db.prepare(`UPDATE jobs SET status = 'kiv', kiv_reason = ?, kiv_follow_up_date = ?, submitted_at = NULL, updated_at = ? WHERE id = ?`).run(
          b.kiv_reason,
          b.kiv_follow_up_date || null,
          stamp,
          job.id
        );
        logJob(db, job.id, req.user.id, 'kiv', b.kiv_reason);
      } else {
        if (to === 'in_progress') {
          db.prepare('UPDATE jobs SET started_at = COALESCE(started_at, ?) WHERE id = ?').run(stamp, job.id);
        }
        if (b.scheduled_date) {
          if (!isValidDate(b.scheduled_date)) fail(400, 'Date must be YYYY-MM-DD');
          db.prepare('UPDATE jobs SET scheduled_date = ? WHERE id = ?').run(b.scheduled_date, job.id);
        }
        db.prepare(
          `UPDATE jobs SET status = ?, kiv_reason = NULL, kiv_follow_up_date = NULL,
             completed_at = CASE WHEN ? = 'cancelled' THEN NULL ELSE completed_at END,
             submitted_at = CASE WHEN ? IN ('pending', 'assigned') THEN NULL ELSE submitted_at END,
             updated_at = ? WHERE id = ?`
        ).run(to, to, to, stamp, job.id);
        logJob(db, job.id, req.user.id, to, b.note || null);
      }
      return jobDetail(db, db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id), req.user);
    })
  );

  // Saves a technician or customer signature as soon as it is captured, so it is never lost
  // if the report isn't submitted straight away; the salesman sees it on the job.
  app.post(
    '/api/jobs/:id/signatures',
    wrap((req) => {
      const job = loadJob(db, req);
      const b = req.body || {};
      if (job.status === 'completed' && req.user.role !== 'admin') fail(400, 'Job is already done');
      const isImage = (v) => typeof v === 'string' && v.startsWith('data:image');
      if (!isImage(b.technician_signature) && !isImage(b.customer_signature)) fail(400, 'Signature image missing');
      if (isImage(b.technician_signature)) {
        db.prepare('UPDATE jobs SET technician_signature = ? WHERE id = ?').run(b.technician_signature, job.id);
        logJob(db, job.id, req.user.id, 'technician_signed');
      }
      if (isImage(b.customer_signature)) {
        db.prepare('UPDATE jobs SET customer_signature = ?, customer_sign_name = COALESCE(?, customer_sign_name) WHERE id = ?').run(
          b.customer_signature,
          b.customer_sign_name || null,
          job.id
        );
        logJob(db, job.id, req.user.id, 'customer_signed', b.customer_sign_name || null);
      }
      return jobDetail(db, db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id), req.user);
    })
  );

  // Technician (or staff on their behalf) submits the on-site job report: work done, accessories,
  // technician and customer signatures. The job then waits for the salesman to mark it as done.
  app.post(
    '/api/jobs/:id/submit-report',
    wrap((req) => {
      const job = loadJob(db, req);
      const b = req.body || {};
      if (['completed', 'cancelled'].includes(job.status)) fail(400, `Job is already ${job.status}`);
      if (!String(b.work_done || '').trim()) fail(400, 'Please fill in work done');
      const stamp = nowStamp();
      setReportFields(db, job.id, b, COMPLETION_FIELDS);
      db.prepare(
        `UPDATE jobs SET status = 'in_progress', work_done = ?, remarks = COALESCE(?, remarks),
           customer_sign_name = COALESCE(?, customer_sign_name), customer_signature = COALESCE(?, customer_signature),
           kiv_reason = NULL, kiv_follow_up_date = NULL, started_at = COALESCE(started_at, ?),
           submitted_at = ?, submitted_by = ?, updated_at = ? WHERE id = ?`
      ).run(
        b.work_done,
        b.remarks ?? null,
        b.customer_sign_name ?? null,
        b.customer_signature ?? null,
        stamp,
        stamp,
        req.user.id,
        stamp,
        job.id
      );
      logJob(db, job.id, req.user.id, job.submitted_at ? 'report_resubmitted' : 'report_submitted');
      return jobDetail(db, db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id), req.user);
    })
  );

  // ---------- Service report (HTML preview and PDF, built on the server) ----------
  const reportPhotos = (jobId) =>
    db
      .prepare('SELECT * FROM job_photos WHERE job_id = ? ORDER BY id')
      .all(jobId)
      .filter((p) => fs.existsSync(photoPath(photosDir, jobId, p.file_name)))
      .map((p) => ({
        stage: p.stage,
        caption: p.caption,
        data_uri: `data:${mimeFor(p.file_name)};base64,${fs.readFileSync(photoPath(photosDir, jobId, p.file_name)).toString('base64')}`,
      }));

  // Preview for checking before the salesman signs (anyone who can open the job).
  app.get(
    '/api/jobs/:id/report.html',
    wrap((req, res) => {
      const job = jobDetail(db, loadJob(db, req), req.user);
      res.type('html').send(previewHtml(job, reportPhotos(job.id)));
    })
  );

  // The PDF customers receive – only once the salesman has signed.
  app.get(
    '/api/jobs/:id/report.pdf',
    wrapAsync(async (req, res) => {
      const job = jobDetail(db, loadJob(db, req), req.user);
      if (!job.salesman_signature) fail(403, 'The service report can be shared or printed once the salesman has signed it');
      const pdf = await reportPdf(reportHtml(job, reportPhotos(job.id)));
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="Service-Report-${job.job_no}.pdf"`);
      res.send(pdf);
    })
  );

  // ---------- Job photos ----------
  // Technicians on the job and staff can add photos until the job is done (admin any time).
  app.post(
    '/api/jobs/:id/photos',
    wrap((req) => {
      const job = loadJob(db, req);
      if (job.status === 'completed' && req.user.role !== 'admin') fail(400, 'Job is already done – ask admin to add photos');
      const count = db.prepare('SELECT COUNT(*) AS n FROM job_photos WHERE job_id = ?').get(job.id).n;
      if (count >= MAX_PHOTOS_PER_JOB) fail(400, `A job can have at most ${MAX_PHOTOS_PER_JOB} photos`);
      const stage = req.body?.stage;
      if (!['before', 'after'].includes(stage)) fail(400, 'Say whether the photo is before or after the service');
      const caption = String(req.body?.caption || '').trim().slice(0, 200);
      if (caption.length < 2) fail(400, 'Please describe what the photo shows');
      const img = decodeImage(req.body?.image);
      if (img.error) fail(400, img.error);
      const fileName = savePhotoFile(photosDir, job.id, img.buffer, img.type);
      db.prepare('INSERT INTO job_photos (job_id, file_name, caption, stage, uploaded_by) VALUES (?, ?, ?, ?, ?)').run(
        job.id,
        fileName,
        caption,
        stage,
        req.user.id
      );
      logJob(db, job.id, req.user.id, stage === 'before' ? 'before_photo' : 'after_photo', caption);
      return jobDetail(db, job, req.user);
    })
  );

  // The photo itself (phones send their login with the request). ?base64=1 returns it as a data URI
  // for embedding in the PDF.
  app.get(
    '/api/jobs/:id/photos/:photoId',
    wrap((req, res) => {
      const job = loadJob(db, req);
      const photo = db.prepare('SELECT * FROM job_photos WHERE id = ? AND job_id = ?').get(req.params.photoId, job.id) || fail(404, 'Photo not found');
      const file = photoPath(photosDir, job.id, photo.file_name);
      if (!fs.existsSync(file)) fail(404, 'Photo file missing');
      if (req.query.base64) return { data_uri: `data:${mimeFor(photo.file_name)};base64,${fs.readFileSync(file).toString('base64')}` };
      res.type(mimeFor(photo.file_name));
      res.set('Cache-Control', 'private, max-age=86400');
      res.sendFile(file);
    })
  );

  app.delete(
    '/api/jobs/:id/photos/:photoId',
    wrap((req) => {
      const job = loadJob(db, req);
      const photo = db.prepare('SELECT * FROM job_photos WHERE id = ? AND job_id = ?').get(req.params.photoId, job.id) || fail(404, 'Photo not found');
      const isAdmin = req.user.role === 'admin';
      // Photos are the technician's evidence: only whoever took it (before the job is done) or admin.
      const mayRemove = isAdmin || (job.status !== 'completed' && photo.uploaded_by === req.user.id);
      if (!mayRemove) fail(403, job.status === 'completed' ? 'Job is already done – ask admin' : 'Only the person who took this photo (or admin) can remove it');
      db.prepare('DELETE FROM job_photos WHERE id = ?').run(photo.id);
      removePhotoFile(photosDir, job.id, photo.file_name);
      logJob(db, job.id, req.user.id, 'photo_removed', photo.caption);
      return jobDetail(db, job, req.user);
    })
  );

  // Salesman/admin confirms a KIV job with the customer: it goes straight back onto the
  // technicians' schedule with the new date, time and crew.
  app.post(
    '/api/jobs/:id/confirm-kiv',
    requireRole(...STAFF),
    wrap((req) => {
      const job = loadJob(db, req);
      const b = req.body || {};
      if (job.status !== 'kiv') fail(400, 'Job is not KIV');
      if (!isValidDate(b.scheduled_date)) fail(400, 'Please pick the new job date');
      if (b.scheduled_time && !/^\d{2}:\d{2}$/.test(b.scheduled_time)) fail(400, 'Time must be HH:MM');
      if (Array.isArray(b.technician_ids)) setTechnicians(db, job.id, b.technician_ids.map(Number));
      const techCount = db.prepare('SELECT COUNT(*) AS n FROM job_technicians WHERE job_id = ?').get(job.id).n;
      db.prepare(
        `UPDATE jobs SET status = ?, scheduled_date = ?, scheduled_time = ?, kiv_reason = NULL, kiv_follow_up_date = NULL,
           updated_at = ? WHERE id = ?`
      ).run(techCount ? 'assigned' : 'pending', b.scheduled_date, b.scheduled_time || null, nowStamp(), job.id);
      logJob(db, job.id, req.user.id, 'kiv_confirmed', `Rescheduled to ${b.scheduled_date}${b.scheduled_time ? ` ${b.scheduled_time}` : ''} (was: ${job.kiv_reason})`);
      return jobDetail(db, db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id), req.user);
    })
  );

  app.post(
    '/api/jobs/:id/salesman-signature',
    requireRole(...STAFF),
    wrap((req) => {
      const job = loadJob(db, req);
      if (job.status !== 'completed' && !job.submitted_at) fail(400, 'The technician has not submitted the job report yet');
      if (!String(req.body?.signature || '').startsWith('data:image')) fail(400, 'Signature image missing');
      db.prepare('UPDATE jobs SET salesman_signature = ?, salesman_signed_at = ?, salesman_id = COALESCE(salesman_id, ?) WHERE id = ?').run(
        req.body.signature,
        nowStamp(),
        req.user.role === 'salesman' ? req.user.id : null,
        job.id
      );
      logJob(db, job.id, req.user.id, 'salesman_signed');
      return jobDetail(db, db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id), req.user);
    })
  );

  // Extra situations on a job (welding etc). Technicians can claim them on their own jobs
  // before completion; admin can always add/remove.
  app.post(
    '/api/jobs/:id/extras',
    wrap((req) => {
      const job = loadJob(db, req);
      if (job.status === 'completed' && req.user.role !== 'admin') fail(400, 'Job completed — ask admin to add extras');
      const b = req.body || {};
      const item = db.prepare('SELECT * FROM extra_items WHERE id = ? AND active = 1').get(b.extra_item_id) || fail(400, 'Unknown extra');
      const qty = num(b.qty) || 1;
      db.prepare('INSERT INTO job_extras (job_id, extra_item_id, technician_id, qty, note, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
        job.id,
        item.id,
        b.technician_id || null,
        qty,
        b.note || null,
        req.user.id
      );
      logJob(db, job.id, req.user.id, 'extra_added', `${item.name} x${qty}${b.note ? ` (${b.note})` : ''}`);
      return jobDetail(db, job, req.user);
    })
  );

  app.delete(
    '/api/jobs/:id/extras/:extraId',
    wrap((req) => {
      const job = loadJob(db, req);
      const extra = db.prepare('SELECT * FROM job_extras WHERE id = ? AND job_id = ?').get(req.params.extraId, job.id) || fail(404, 'Not found');
      const own = extra.created_by === req.user.id && job.status !== 'completed';
      if (req.user.role !== 'admin' && !own) fail(403, 'Only admin can remove this');
      db.prepare('DELETE FROM job_extras WHERE id = ?').run(extra.id);
      logJob(db, job.id, req.user.id, 'extra_removed');
      return jobDetail(db, job, req.user);
    })
  );

  app.post(
    '/api/jobs/:id/adjustments',
    requireRole('admin'),
    wrap((req) => {
      const job = loadJob(db, req);
      const b = req.body || {};
      if (!b.technician_id || !b.reason || !Number.isFinite(Number(b.amount))) fail(400, 'Technician, amount and reason are required');
      db.prepare('INSERT INTO incentive_adjustments (job_id, technician_id, amount, reason, created_by) VALUES (?, ?, ?, ?, ?)').run(
        job.id,
        b.technician_id,
        Number(b.amount),
        b.reason,
        req.user.id
      );
      logJob(db, job.id, req.user.id, 'adjustment', `RM${Number(b.amount).toFixed(2)} — ${b.reason}`);
      return jobDetail(db, job, req.user);
    })
  );

  app.delete(
    '/api/jobs/:id/adjustments/:adjId',
    requireRole('admin'),
    wrap((req) => {
      const job = loadJob(db, req);
      db.prepare('DELETE FROM incentive_adjustments WHERE id = ? AND job_id = ?').run(req.params.adjId, job.id);
      return jobDetail(db, job, req.user);
    })
  );

  // ---------- Incentives, reminders ----------
  app.get(
    '/api/incentives',
    wrap((req) => {
      const from = req.query.from || `${today().slice(0, 7)}-01`;
      const to = req.query.to || today();
      if (!isValidDate(from) || !isValidDate(to)) fail(400, 'Dates must be YYYY-MM-DD');
      const techId = req.user.role === 'technician' ? req.user.id : req.query.technician_id ? Number(req.query.technician_id) : null;
      if (req.user.role === 'salesman') fail(403, 'Not allowed for your role');
      return incentiveReport(db, from, to, techId);
    })
  );

  // Opening Today also creates any servicing jobs that are now due (see generateContractJobsIfDue).
  app.get(
    '/api/reminders',
    wrap((req) => {
      generateContractJobsIfDue(db);
      return reminders(db, req.user);
    })
  );

  app.get(
    '/api/export/incentives.xlsx',
    requireRole('admin'),
    wrapAsync(async (req, res) => {
      const from = req.query.from || `${today().slice(0, 7)}-01`;
      const to = req.query.to || today();
      if (!isValidDate(from) || !isValidDate(to)) fail(400, 'Dates must be YYYY-MM-DD');
      sendFile(res, await incentiveWorkbook(incentiveReport(db, from, to)), XLSX, `Incentive-${from}-to-${to}.xlsx`);
    })
  );

  // ---------- Settings (admin can change; everyone can read, so the app knows what to show) ----------
  app.get('/api/settings', wrap(() => getSettings(db)));
  app.put(
    '/api/settings',
    requireRole('admin'),
    wrap((req) => {
      const error = saveSettings(db, req.body);
      if (error) fail(400, error);
      return getSettings(db);
    })
  );

  // Installed models in a period (Incentive tab). Technicians only see their own jobs; salesmen
  // only if the admin allows it (Settings), either their own jobs or all jobs.
  app.get(
    '/api/reports/installed',
    wrap((req) => {
      const salesAccess = getSettings(db).salesman_installed_report;
      if (req.user.role === 'salesman' && salesAccess === 'off') fail(403, 'Not allowed for your role');
      const from = req.query.from || `${today().slice(0, 7)}-01`;
      const to = req.query.to || today();
      if (!isValidDate(from) || !isValidDate(to)) fail(400, 'Dates must be YYYY-MM-DD');
      return installedSummary(db, from, to, {
        jobTypeId: req.query.job_type_id ? Number(req.query.job_type_id) : null,
        technicianId: req.user.role === 'technician' ? req.user.id : null,
        salesmanId: req.user.role === 'salesman' && salesAccess === 'own' ? req.user.id : null,
      });
    })
  );

  app.get(
    '/api/export/installed.xlsx',
    wrapAsync(async (req, res) => {
      const salesAccess = getSettings(db).salesman_installed_report;
      if (req.user.role === 'salesman' && salesAccess === 'off') fail(403, 'Not allowed for your role');
      const from = req.query.from || `${today().slice(0, 7)}-01`;
      const to = req.query.to || today();
      if (!isValidDate(from) || !isValidDate(to)) fail(400, 'Dates must be YYYY-MM-DD');
      const report = installedSummary(db, from, to, {
        jobTypeId: req.query.job_type_id ? Number(req.query.job_type_id) : null,
        technicianId: req.user.role === 'technician' ? req.user.id : null,
        salesmanId: req.user.role === 'salesman' && salesAccess === 'own' ? req.user.id : null,
      });
      sendFile(res, await installedWorkbook(report), XLSX, `Installed-models-${from}-to-${to}.xlsx`);
    })
  );

  // ---------- Service contracts ----------
  app.get(
    '/api/contracts',
    requireRole(...STAFF),
    wrap(() =>
      db
        .prepare(
          `SELECT c.*, jt.name AS job_type FROM service_contracts c JOIN job_types jt ON jt.id = c.job_type_id
           ORDER BY c.active DESC, c.next_service_date`
        )
        .all()
    )
  );

  app.post(
    '/api/contracts',
    requireRole(...STAFF),
    wrap((req) => {
      const b = req.body || {};
      if (!b.customer_name || !b.job_type_id || !isValidDate(b.start_date)) fail(400, 'Customer, job type and start date (YYYY-MM-DD) are required');
      if (b.end_date && !isValidDate(b.end_date)) fail(400, 'End date must be YYYY-MM-DD');
      const next = b.next_service_date && isValidDate(b.next_service_date) ? b.next_service_date : b.start_date;
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO service_contracts (customer_name, customer_phone, address, job_type_id, interval_months,
             start_date, end_date, next_service_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(b.customer_name, b.customer_phone || null, b.address || null, b.job_type_id, num(b.interval_months) || 3, b.start_date, b.end_date || null, next, b.notes || null);
      generateContractJobs(db);
      return db.prepare('SELECT * FROM service_contracts WHERE id = ?').get(lastInsertRowid);
    })
  );

  app.put(
    '/api/contracts/:id',
    requireRole(...STAFF),
    wrap((req) => {
      const c = db.prepare('SELECT * FROM service_contracts WHERE id = ?').get(req.params.id) || fail(404, 'Not found');
      const b = { ...c, ...req.body };
      for (const k of ['start_date', 'next_service_date']) if (!isValidDate(b[k])) fail(400, `${k} must be YYYY-MM-DD`);
      if (b.end_date && !isValidDate(b.end_date)) fail(400, 'End date must be YYYY-MM-DD');
      db.prepare(
        `UPDATE service_contracts SET customer_name = ?, customer_phone = ?, address = ?, job_type_id = ?, interval_months = ?,
           start_date = ?, end_date = ?, next_service_date = ?, notes = ?, active = ? WHERE id = ?`
      ).run(b.customer_name, b.customer_phone || null, b.address || null, b.job_type_id, num(b.interval_months) || 3, b.start_date, b.end_date || null, b.next_service_date, b.notes || null, b.active ? 1 : 0, c.id);
      generateContractJobs(db);
      return db.prepare('SELECT * FROM service_contracts WHERE id = ?').get(c.id);
    })
  );

  app.post('/api/contracts/run', requireRole('admin'), wrap(() => ({ created: generateContractJobs(db) })));

  app.use((err, req, res, next) => {
    const status = err.status || (String(err.message).includes('UNIQUE') ? 409 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 409 ? 'That name/username already exists' : err.message });
  });

  return app;
}

// Slows down password guessing now that the server is on the internet: after MAX_FAILS wrong
// passwords for the same username from the same address, logins are refused for BLOCK_MS.
const MAX_FAILS = 8;
const BLOCK_MS = 15 * 60 * 1000;
function createLoginGuard() {
  const fails = new Map(); // key -> { count, since }
  const fresh = (key) => {
    const f = fails.get(key);
    if (f && Date.now() - f.since > BLOCK_MS) fails.delete(key);
    return fails.get(key);
  };
  return {
    blocked: (key) => (fresh(key)?.count ?? 0) >= MAX_FAILS,
    failed: (key) => {
      const f = fresh(key) ?? { count: 0, since: Date.now() };
      f.count += 1;
      fails.set(key, f);
    },
    reset: (key) => fails.delete(key),
  };
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    grade: u.grade,
    phone: u.phone,
    active: u.active,
    must_change_password: u.must_change_password ?? 0,
  };
}

function checkPassword(pw) {
  if (String(pw || '').length < 6) fail(400, 'Password must be at least 6 characters');
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function optNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function validateJob(b) {
  if (!b.customer_name || !b.job_type_id) fail(400, 'Customer name and job type are required');
  if (b.scheduled_date && !isValidDate(b.scheduled_date)) fail(400, 'Date must be YYYY-MM-DD');
  if (b.scheduled_time && !/^\d{2}:\d{2}$/.test(b.scheduled_time)) fail(400, 'Time must be HH:MM');
}

function setTechnicians(db, jobId, ids) {
  db.prepare('DELETE FROM job_technicians WHERE job_id = ?').run(jobId);
  const ins = db.prepare('INSERT INTO job_technicians (job_id, user_id) VALUES (?, ?)');
  for (const id of new Set(ids)) ins.run(jobId, id);
}

function loadJob(db, req) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id) || fail(404, 'Job not found');
  if (req.user.role === 'technician') {
    const assigned = db.prepare('SELECT 1 FROM job_technicians WHERE job_id = ? AND user_id = ?').get(job.id, req.user.id);
    if (!assigned) fail(403, 'This job is not assigned to you');
  }
  return job;
}

function jobDetail(db, job, user) {
  const full = db
    .prepare(
      `SELECT j.*, jt.name AS job_type, s.name AS salesman_name, c.name AS created_by_name
       FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id
       LEFT JOIN users s ON s.id = j.salesman_id LEFT JOIN users c ON c.id = j.created_by
       WHERE j.id = ?`
    )
    .get(job.id);
  full.accessories = parseJson(full.accessories);
  full.technicians = db
    .prepare(
      `SELECT u.id, u.name, COALESCE(x.grade, u.grade) AS grade FROM job_technicians x JOIN users u ON u.id = x.user_id
       WHERE x.job_id = ? ORDER BY u.name`
    )
    .all(job.id);
  full.extras = db
    .prepare(
      `SELECT je.id, je.qty, je.note, je.technician_id, je.created_by, ei.name, ei.unit, u.name AS technician_name
       FROM job_extras je JOIN extra_items ei ON ei.id = je.extra_item_id LEFT JOIN users u ON u.id = je.technician_id
       WHERE je.job_id = ? ORDER BY je.id`
    )
    .all(job.id);
  full.photos = db
    .prepare(
      `SELECT p.id, p.caption, p.stage, p.created_at, p.uploaded_by, u.name AS uploaded_by_name
       FROM job_photos p LEFT JOIN users u ON u.id = p.uploaded_by WHERE p.job_id = ? ORDER BY p.id`
    )
    .all(job.id);
  full.logs = db
    .prepare(
      `SELECT l.action, l.note, l.created_at, u.name AS user_name FROM job_logs l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.job_id = ? ORDER BY l.id DESC`
    )
    .all(job.id);
  if (user.role !== 'salesman') {
    const lines = jobIncentive(db, job.id);
    full.incentive = user.role === 'technician' ? lines.filter((l) => l.technician_id === user.id) : lines;
  }
  return full;
}
