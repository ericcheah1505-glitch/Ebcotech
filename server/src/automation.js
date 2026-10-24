import { addDays, addMonths, nowStamp, today } from './dates.js';

export function logJob(db, jobId, userId, action, note = null) {
  db.prepare('INSERT INTO job_logs (job_id, user_id, action, note) VALUES (?, ?, ?, ?)').run(
    jobId,
    userId,
    action,
    note
  );
}

// Service-report fields that can be set when posting/editing a job or when completing it.
const REPORT_FIELDS = {
  product_model: 'text',
  product_variant: 'text',
  product_brand: 'text',
  inv_do_no: 'text',
  site_contact: 'text',
  owner_name: 'text',
  outstation: 'bool',
  night_work: 'bool',
  accessories: 'json',
  customer_comment: 'text',
  technician_signature: 'text',
};
export const POSTING_FIELDS = ['product_model', 'product_variant', 'product_brand', 'inv_do_no', 'site_contact', 'owner_name', 'outstation', 'accessories'];
export const COMPLETION_FIELDS = ['product_model', 'product_variant', 'product_brand', 'night_work', 'accessories', 'customer_comment', 'technician_signature'];

// Writes only the listed fields that are present in body.
export function setReportFields(db, jobId, body, keys) {
  for (const key of keys) {
    if (!body || !(key in body) || body[key] === undefined) continue;
    let value = body[key];
    const kind = REPORT_FIELDS[key];
    if (kind === 'bool') value = value ? 1 : 0;
    else if (kind === 'json') value = value && typeof value === 'object' ? JSON.stringify(value) : null;
    else value = value === '' || value == null ? null : String(value);
    db.prepare(`UPDATE jobs SET ${key} = ? WHERE id = ?`).run(value, jobId);
  }
}

export function assignJobNo(db, jobId) {
  const d = new Date();
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const jobNo = `J${yymm}-${String(jobId).padStart(4, '0')}`;
  db.prepare('UPDATE jobs SET job_no = ? WHERE id = ?').run(jobNo, jobId);
  return jobNo;
}

// Marks a job complete: stamps completion time, computes warranty end, freezes technician
// grades for incentive, and rolls the service contract forward to its next due date.
export function completeJob(db, jobId, userId, body = {}) {
  const { work_done, remarks, customer_sign_name, customer_signature } = body;
  setReportFields(db, jobId, body, COMPLETION_FIELDS);
  const job = db
    .prepare(
      `SELECT j.*, jt.warranty_months AS type_warranty FROM jobs j
       JOIN job_types jt ON jt.id = j.job_type_id WHERE j.id = ?`
    )
    .get(jobId);
  // The job is done when the technician finished on site (report submitted), not when the
  // salesman confirms it, so warranty starts from then.
  const completedAt = job.submitted_at ?? nowStamp();
  const warrantyMonths = job.warranty_months ?? job.type_warranty;
  const warrantyEnd = warrantyMonths > 0 ? addMonths(completedAt.slice(0, 10), warrantyMonths) : null;

  db.prepare(
    `UPDATE jobs SET status = 'completed', completed_at = ?, warranty_months = ?, warranty_end = ?,
       work_done = COALESCE(?, work_done), remarks = COALESCE(?, remarks),
       customer_sign_name = COALESCE(?, customer_sign_name),
       customer_signature = COALESCE(?, customer_signature),
       kiv_reason = NULL, kiv_follow_up_date = NULL,
       started_at = COALESCE(started_at, ?), updated_at = ?
     WHERE id = ?`
  ).run(
    completedAt,
    warrantyMonths,
    warrantyEnd,
    work_done ?? null,
    remarks ?? null,
    customer_sign_name ?? null,
    customer_signature ?? null,
    completedAt,
    completedAt,
    jobId
  );

  db.prepare(
    `UPDATE job_technicians SET grade = (SELECT COALESCE(grade, 'junior') FROM users WHERE users.id = job_technicians.user_id)
     WHERE job_id = ?`
  ).run(jobId);

  if (job.contract_id && job.contract_due_date) {
    const contract = db.prepare('SELECT * FROM service_contracts WHERE id = ?').get(job.contract_id);
    if (contract && contract.next_service_date <= job.contract_due_date) {
      const next = addMonths(job.contract_due_date, contract.interval_months);
      const ended = contract.end_date && next > contract.end_date;
      db.prepare('UPDATE service_contracts SET next_service_date = ?, active = ? WHERE id = ?').run(
        next,
        ended ? 0 : contract.active,
        contract.id
      );
    }
  }

  logJob(db, jobId, userId, 'completed', warrantyEnd ? `Marked as done · warranty until ${warrantyEnd}` : 'Marked as done');
}

export const monthsLabel = (m) => (m > 0 && m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''}` : `${m} month${m === 1 ? '' : 's'}`);

// Works the warranty end out again from the completion date, after the warranty months or the job type
// of a completed job were changed. Returns a note for the job history when the end date moved.
export function refreshWarranty(db, jobId) {
  const j = db
    .prepare(
      `SELECT j.completed_at, j.warranty_months, j.warranty_end, jt.warranty_months AS type_warranty
       FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id WHERE j.id = ? AND j.status = 'completed'`
    )
    .get(jobId);
  if (!j?.completed_at) return null;
  const months = j.warranty_months ?? j.type_warranty;
  const end = months > 0 ? addMonths(j.completed_at.slice(0, 10), months) : null;
  db.prepare('UPDATE jobs SET warranty_months = ?, warranty_end = ? WHERE id = ?').run(months, end, jobId);
  if (end === j.warranty_end) return null;
  return end ? `Warranty changed to ${monthsLabel(months)} · until ${end}` : 'Warranty removed';
}

// Creates a pending servicing job for every active contract due within `daysAhead` days,
// once per contract cycle. Safe to run repeatedly.
export function generateContractJobs(db, daysAhead = 14) {
  const horizon = addDays(today(), daysAhead);
  const due = db
    .prepare(
      `SELECT c.* FROM service_contracts c
       WHERE c.active = 1 AND c.next_service_date <= ?
         AND (c.end_date IS NULL OR c.next_service_date <= c.end_date)
         AND NOT EXISTS (
           SELECT 1 FROM jobs j WHERE j.contract_id = c.id AND j.contract_due_date = c.next_service_date
         )`
    )
    .all(horizon);

  const insert = db.prepare(
    `INSERT INTO jobs (job_type_id, customer_name, customer_phone, address, description,
       scheduled_date, status, contract_id, contract_due_date)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  );
  const created = [];
  for (const c of due) {
    const { lastInsertRowid } = insert.run(
      c.job_type_id,
      c.customer_name,
      c.customer_phone,
      c.address,
      `Contract servicing (every ${c.interval_months} month(s))${c.notes ? ` — ${c.notes}` : ''}`,
      c.next_service_date,
      c.id,
      c.next_service_date
    );
    const id = Number(lastInsertRowid);
    assignJobNo(db, id);
    logJob(db, id, null, 'created', 'Auto-created from service contract');
    created.push(id);
  }
  return created;
}

// Runs the contract check when someone opens the system (Today page) instead of on a timer, so the
// server doesn't have to be always on. At most once per `everyMinutes` per database; the check itself
// never creates a second job for the same due date.
const lastContractCheck = new WeakMap();
export function generateContractJobsIfDue(db, everyMinutes = 60) {
  const last = lastContractCheck.get(db) ?? 0;
  if (Date.now() - last < everyMinutes * 60 * 1000) return [];
  lastContractCheck.set(db, Date.now());
  return generateContractJobs(db);
}

const JOB_LIST_SQL = `
  SELECT j.id, j.job_no, j.customer_name, j.address, j.scheduled_date, j.scheduled_time, j.status,
         j.kiv_reason, j.kiv_follow_up_date, j.warranty_end, j.completed_at, j.contract_id,
         j.inv_do_no, j.submitted_at, j.product_model, j.product_variant, j.salesman_id, j.job_type_id,
         jt.name AS job_type, sm.name AS salesman_name,
         (SELECT GROUP_CONCAT(u.name, ', ') FROM job_technicians x JOIN users u ON u.id = x.user_id
           WHERE x.job_id = j.id) AS technicians
  FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id LEFT JOIN users sm ON sm.id = j.salesman_id`;

export function reminders(db, user) {
  const t = today();
  const isTech = user.role === 'technician';
  const isSales = user.role === 'salesman';
  const mine = isTech
    ? ` AND EXISTS (SELECT 1 FROM job_technicians x WHERE x.job_id = j.id AND x.user_id = ${Number(user.id)})`
    : isSales
      ? ` AND (j.salesman_id = ${Number(user.id)} OR j.created_by = ${Number(user.id)})`
      : '';
  const open = `j.status IN ('pending','assigned','in_progress')`;

  const out = {
    today: db.prepare(`${JOB_LIST_SQL} WHERE j.scheduled_date = ? AND ${open}${mine} ORDER BY j.scheduled_time`).all(t),
    tomorrow: db
      .prepare(`${JOB_LIST_SQL} WHERE j.scheduled_date = ? AND ${open}${mine} ORDER BY j.scheduled_time`)
      .all(addDays(t, 1)),
    overdue: db.prepare(`${JOB_LIST_SQL} WHERE j.scheduled_date < ? AND ${open}${mine} ORDER BY j.scheduled_date`).all(t),
    kiv: db
      .prepare(`${JOB_LIST_SQL} WHERE j.status = 'kiv'${mine} ORDER BY COALESCE(j.kiv_follow_up_date, '9999')`)
      .all(),
  };

  if (!isTech) {
    out.unassigned = db
      .prepare(`${JOB_LIST_SQL} WHERE j.status = 'pending'${mine} ORDER BY j.scheduled_date`)
      .all();
    out.upcoming_contracts = db
      .prepare(
        `SELECT c.id, c.customer_name, c.address, c.next_service_date, c.interval_months, jt.name AS job_type
         FROM service_contracts c JOIN job_types jt ON jt.id = c.job_type_id
         WHERE c.active = 1 AND c.next_service_date <= ? ORDER BY c.next_service_date`
      )
      .all(addDays(t, 30));
    out.warranty_expiring = db
      .prepare(`${JOB_LIST_SQL} WHERE j.status = 'completed' AND j.warranty_end BETWEEN ? AND ?${mine} ORDER BY j.warranty_end`)
      .all(t, addDays(t, 30));
    out.awaiting_done = db
      .prepare(`${JOB_LIST_SQL} WHERE j.status = 'in_progress' AND j.submitted_at IS NOT NULL${mine} ORDER BY j.submitted_at`)
      .all();
    out.awaiting_signature = db
      .prepare(`${JOB_LIST_SQL} WHERE j.status = 'completed' AND j.salesman_signature IS NULL${mine} ORDER BY j.completed_at DESC`)
      .all();
  }
  return out;
}

export { JOB_LIST_SQL };
