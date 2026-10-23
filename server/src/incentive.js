// Incentive per technician on a job =
//   base rate of the job type for the technician's grade (senior / junior)
// + every extra situation recorded on the job (qty x grade amount)
// + manual adjustments (for special cases no rule covers, always with a reason)
// Rules:
// - Only completed jobs earn incentive.
// - Under-warranty jobs earn no base or extras (admin adjustments still apply).
// - If the job has an incentive cap and the technicians' base rates add up to more than it
//   (e.g. heavy glass needing 3-5 people), the cap is split equally between them instead.

const round2 = (n) => Math.round(n * 100) / 100;

export function jobIncentive(db, jobId) {
  const job = db
    .prepare(
      `SELECT j.id, j.status, j.under_warranty, jt.senior_rate, jt.junior_rate,
              COALESCE(j.incentive_cap, jt.incentive_cap) AS cap
       FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id WHERE j.id = ?`
    )
    .get(jobId);
  if (!job) return [];

  const techs = db
    .prepare(
      `SELECT u.id, u.name, COALESCE(jt.grade, u.grade, 'junior') AS grade
       FROM job_technicians jt JOIN users u ON u.id = jt.user_id
       WHERE jt.job_id = ? ORDER BY u.name`
    )
    .all(jobId);

  const extras = db
    .prepare(
      `SELECT je.id, je.technician_id, je.qty, je.note, ei.name, ei.unit, ei.senior_amount, ei.junior_amount
       FROM job_extras je JOIN extra_items ei ON ei.id = je.extra_item_id
       WHERE je.job_id = ? ORDER BY je.id`
    )
    .all(jobId);

  const adjustments = db
    .prepare(
      `SELECT id, technician_id, amount, reason FROM incentive_adjustments WHERE job_id = ? ORDER BY id`
    )
    .all(jobId);

  const completed = job.status === 'completed';
  const earns = completed && !job.under_warranty;
  const rateOf = (t) => (t.grade === 'senior' ? job.senior_rate : job.junior_rate);
  const uncapped = techs.reduce((s, t) => s + rateOf(t), 0);
  const capped = earns && job.cap != null && job.cap > 0 && uncapped > job.cap;
  const shareOfCap = capped ? round2(job.cap / techs.length) : 0;

  return techs.map((t) => {
    const base = earns ? (capped ? shareOfCap : rateOf(t)) : 0;
    const myExtras = extras
      .filter((e) => e.technician_id == null || e.technician_id === t.id)
      .map((e) => {
        const unitAmount = t.grade === 'senior' ? e.senior_amount : e.junior_amount;
        return {
          id: e.id,
          name: e.name,
          unit: e.unit,
          qty: e.qty,
          note: e.note,
          amount: earns ? round2(unitAmount * e.qty) : 0,
        };
      });
    const myAdj = adjustments
      .filter((a) => a.technician_id === t.id)
      .map((a) => ({ ...a, amount: completed ? a.amount : 0 }));
    const total = round2(
      base + myExtras.reduce((s, e) => s + e.amount, 0) + myAdj.reduce((s, a) => s + a.amount, 0)
    );
    return {
      technician_id: t.id,
      name: t.name,
      grade: t.grade,
      base,
      extras: myExtras,
      adjustments: myAdj,
      total,
      earns,
      under_warranty: !!job.under_warranty,
      capped,
      cap: job.cap ?? null,
    };
  });
}

// Summary for completed jobs whose completion date falls in [from, to].
export function incentiveReport(db, from, to, technicianId = null) {
  const jobs = db
    .prepare(
      `SELECT j.id, j.job_no, j.customer_name, j.completed_at, jt.name AS job_type
       FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id
       WHERE j.status = 'completed' AND substr(j.completed_at, 1, 10) BETWEEN ? AND ?
       ORDER BY j.completed_at`
    )
    .all(from, to);

  const byTech = new Map();
  for (const job of jobs) {
    for (const line of jobIncentive(db, job.id)) {
      if (technicianId && line.technician_id !== technicianId) continue;
      if (!byTech.has(line.technician_id)) {
        byTech.set(line.technician_id, {
          technician_id: line.technician_id,
          name: line.name,
          grade: line.grade,
          job_count: 0,
          base_total: 0,
          extras_total: 0,
          adjustments_total: 0,
          total: 0,
          jobs: [],
        });
      }
      const t = byTech.get(line.technician_id);
      const extrasSum = line.extras.reduce((s, e) => s + e.amount, 0);
      const adjSum = line.adjustments.reduce((s, a) => s + a.amount, 0);
      t.job_count += 1;
      t.base_total = round2(t.base_total + line.base);
      t.extras_total = round2(t.extras_total + extrasSum);
      t.adjustments_total = round2(t.adjustments_total + adjSum);
      t.total = round2(t.total + line.total);
      t.jobs.push({
        job_id: job.id,
        job_no: job.job_no,
        customer_name: job.customer_name,
        job_type: job.job_type,
        completed_at: job.completed_at,
        base: line.base,
        extras: line.extras,
        adjustments: line.adjustments,
        total: line.total,
      });
    }
  }
  const technicians = [...byTech.values()].sort((a, b) => b.total - a.total);
  return {
    from,
    to,
    technicians,
    grand_total: round2(technicians.reduce((s, t) => s + t.total, 0)),
  };
}
