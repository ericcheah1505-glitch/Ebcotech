// What was installed (or serviced) in a period: completed jobs grouped by model and
// single/double door, with the jobs behind each count.

export function installedSummary(db, from, to, { jobTypeId = null, technicianId = null, salesmanId = null } = {}) {
  const where = [`j.status = 'completed'`, 'substr(j.completed_at, 1, 10) BETWEEN ? AND ?'];
  const params = [from, to];
  if (jobTypeId) {
    where.push('j.job_type_id = ?');
    params.push(jobTypeId);
  }
  if (technicianId) {
    where.push('EXISTS (SELECT 1 FROM job_technicians x WHERE x.job_id = j.id AND x.user_id = ?)');
    params.push(technicianId);
  }
  if (salesmanId) {
    where.push('(j.salesman_id = ? OR j.created_by = ?)');
    params.push(salesmanId, salesmanId);
  }
  const jobs = db
    .prepare(
      `SELECT j.id AS job_id, j.job_no, j.customer_name, j.address, j.completed_at, j.inv_do_no,
              j.product_model, j.product_variant, j.product_brand, jt.name AS job_type,
              (SELECT GROUP_CONCAT(u.name, ', ') FROM job_technicians x JOIN users u ON u.id = x.user_id
                WHERE x.job_id = j.id) AS technicians
       FROM jobs j JOIN job_types jt ON jt.id = j.job_type_id
       WHERE ${where.join(' AND ')}
       ORDER BY j.completed_at DESC`
    )
    .all(...params);

  const groups = new Map();
  for (const job of jobs) {
    const model = job.product_model?.trim() || null;
    const variant = model ? job.product_variant || null : null;
    const key = `${model ?? ''}|${variant ?? ''}`;
    if (!groups.has(key)) groups.set(key, { model, variant, count: 0, jobs: [] });
    const g = groups.get(key);
    g.count += 1;
    g.jobs.push(job);
  }
  // Most installed first; jobs with no model recorded go last.
  const by_model = [...groups.values()].sort(
    (a, b) => (a.model === null) - (b.model === null) || b.count - a.count || String(a.model).localeCompare(String(b.model))
  );
  return { from, to, total: jobs.length, by_model };
}
