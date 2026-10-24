// Warranty follow-up: customers whose warranty ends soon (or just ended), so the salesman can offer
// servicing or a service contract. What the system can see by itself is recorded automatically:
//   new        – nothing done yet
//   contacted  – WhatsApp or Call was tapped in the system (or set by hand)
//   booked     – a servicing job or service contract was created from the follow-up
// What happens outside the system takes one tap: quoted, callback (call back on a date), declined.
// "Expired" is shown, not stored: the warranty ended while the follow-up was still new.
import { logJob } from './automation.js';
import { nowStamp, parseDate, today } from './dates.js';

export const FOLLOWUP_STATUSES = ['new', 'contacted', 'quoted', 'callback', 'declined', 'booked'];
const LABEL = {
  new: 'not contacted',
  contacted: 'contacted',
  quoted: 'quoted',
  callback: 'call back later',
  declined: 'declined',
  booked: 'booked',
};

// Completed jobs with a warranty end date. Jobs made by a service contract are left out (those customers
// are already covered), and so are warranty claims (the original job carries the warranty).
const FOLLOWUP_SQL = `
  SELECT j.id AS job_id, j.job_no, j.customer_name, j.customer_phone, j.address, j.product_model, j.product_variant,
         j.inv_do_no, j.completed_at, j.warranty_end, j.warranty_months, j.job_type_id, jt.name AS job_type,
         j.salesman_id, sm.name AS salesman_name,
         COALESCE(f.status, 'new') AS status, f.note, f.callback_date, f.contacted_at, cu.name AS contacted_by_name,
         f.booked_job_id, bj.job_no AS booked_job_no, f.booked_contract_id, f.updated_at, uu.name AS updated_by_name,
         EXISTS (SELECT 1 FROM service_contracts c
                 WHERE c.active = 1 AND lower(trim(c.customer_name)) = lower(trim(j.customer_name))) AS has_contract
  FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id
  LEFT JOIN users sm ON sm.id = j.salesman_id
  LEFT JOIN warranty_followups f ON f.job_id = j.id
  LEFT JOIN users cu ON cu.id = f.contacted_by
  LEFT JOIN users uu ON uu.id = f.updated_by
  LEFT JOIN jobs bj ON bj.id = f.booked_job_id
  WHERE j.status = 'completed' AND j.warranty_end IS NOT NULL AND j.contract_id IS NULL AND j.under_warranty = 0`;

// Salesmen follow up their own customers (jobs they sold or posted); admin sees everyone.
function mine(user) {
  return user.role === 'salesman' ? { sql: ' AND (j.salesman_id = ? OR j.created_by = ?)', params: [user.id, user.id] } : { sql: '', params: [] };
}

const daysBetween = (from, to) => Math.round((parseDate(to) - parseDate(from)) / 86400000);

// A newer job posted the usual way for the same customer (same name or phone), so staff can mark the
// follow-up as booked with one tap. Only a suggestion – the system doesn't decide by itself.
function possibleMatch(db, r) {
  const phone = String(r.customer_phone || '').replace(/[\s-]/g, '');
  return (
    db
      .prepare(
        `SELECT n.id, n.job_no, jt.name AS job_type, n.created_at FROM jobs n JOIN job_types jt ON jt.id = n.job_type_id
         WHERE n.id != ? AND n.status != 'cancelled' AND n.created_at >= ?
           AND (lower(trim(n.customer_name)) = lower(trim(?))
                OR (? != '' AND REPLACE(REPLACE(COALESCE(n.customer_phone, ''), '-', ''), ' ', '') = ?))
         ORDER BY n.id DESC LIMIT 1`
      )
      .get(r.job_id, r.completed_at, r.customer_name, phone, phone) ?? null
  );
}

function decorate(db, r, t) {
  const done = r.status === 'booked' || r.status === 'declined';
  return {
    ...r,
    has_contract: !!r.has_contract,
    days_left: daysBetween(t, r.warranty_end),
    expired: r.status === 'new' && r.warranty_end < t,
    callback_due: r.status === 'callback' && !!r.callback_date && r.callback_date <= t,
    possible_match: done ? null : possibleMatch(db, r),
  };
}

// show: open (still to follow up; customers already on a service contract are left out), booked, declined, all.
export function followups(db, user, { from, to, show = 'open', salesmanId = null }) {
  const m = mine(user);
  const extra = !m.sql && salesmanId ? ' AND j.salesman_id = ?' : '';
  const rows = db
    .prepare(`${FOLLOWUP_SQL} AND j.warranty_end BETWEEN ? AND ?${m.sql}${extra} ORDER BY j.warranty_end, j.id`)
    .all(from, to, ...m.params, ...(extra ? [salesmanId] : []));
  const t = today();
  return rows
    .map((r) => decorate(db, r, t))
    .filter((r) =>
      show === 'all' ? true : show === 'open' ? !['booked', 'declined'].includes(r.status) && !r.has_contract : r.status === show
    );
}

// "Call back later" follow-ups whose date has come (shown on Today and at the top of the follow-up page).
export function callbacksDue(db, user) {
  const m = mine(user);
  const t = today();
  return db
    .prepare(`${FOLLOWUP_SQL} AND f.status = 'callback' AND f.callback_date <= ?${m.sql} ORDER BY f.callback_date, j.id`)
    .all(t, ...m.params)
    .map((r) => decorate(db, r, t));
}

export function followupItem(db, jobId) {
  const r = db.prepare(`${FOLLOWUP_SQL} AND j.id = ?`).get(jobId);
  return r ? decorate(db, r, today()) : null;
}

// Saves the follow-up of one job and notes it in that job's history.
export function setFollowup(db, jobId, userId, changes, historyNote) {
  const cur = db.prepare('SELECT * FROM warranty_followups WHERE job_id = ?').get(jobId) ?? {};
  const f = {
    status: 'new',
    note: null,
    callback_date: null,
    contacted_at: null,
    contacted_by: null,
    booked_job_id: null,
    booked_contract_id: null,
    ...cur,
    ...changes,
  };
  db.prepare(
    `INSERT INTO warranty_followups (job_id, status, note, callback_date, contacted_at, contacted_by, booked_job_id,
       booked_contract_id, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET status = excluded.status, note = excluded.note, callback_date = excluded.callback_date,
       contacted_at = excluded.contacted_at, contacted_by = excluded.contacted_by, booked_job_id = excluded.booked_job_id,
       booked_contract_id = excluded.booked_contract_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(jobId, f.status, f.note, f.callback_date, f.contacted_at, f.contacted_by, f.booked_job_id, f.booked_contract_id, nowStamp(), userId);
  logJob(db, jobId, userId, 'warranty', historyNote ?? `Follow-up: ${LABEL[f.status]}${f.note ? ` – ${f.note}` : ''}`);
}

export function followupStatusOf(db, jobId) {
  return db.prepare('SELECT status FROM warranty_followups WHERE job_id = ?').get(jobId)?.status ?? 'new';
}
