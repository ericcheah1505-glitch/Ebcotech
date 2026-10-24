import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { addMonths, today } from '../src/dates.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function setup() {
  const db = openDb(':memory:');
  const photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebcotech-photos-'));
  const server = createApp(db, { photosDir }).listen(0);
  server.on('close', () => fs.rmSync(photosDir, { recursive: true, force: true }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (token, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
    return data;
  };
  const login = async (u, p) => (await call(null, 'POST', '/login', { username: u, password: p })).token;
  const raw = (token, path) => fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
  return { db, server, call, login, raw, photosDir };
}

const SIG = 'data:image/png;base64,AA';

// The normal way a job gets done: report submitted, salesman signs, salesman marks it done.
async function finishJob(call, token, id) {
  const job = await call(token, 'GET', `/jobs/${id}`);
  if (!job.submitted_at) await call(token, 'POST', `/jobs/${id}/submit-report`, { work_done: job.work_done || 'Done' });
  if (!job.salesman_signature) await call(token, 'POST', `/jobs/${id}/salesman-signature`, { signature: SIG });
  return call(token, 'POST', `/jobs/${id}/status`, { status: 'completed' });
}

test('full job flow: post, assign, extras, complete, warranty, signature, incentive', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123'); // senior
    const tech2 = await login('tech2', 'tech123'); // junior
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const t2 = users.find((u) => u.username === 'tech2').id;
    const types = await call(admin, 'GET', '/job-types');
    const install = types.find((t) => t.name === 'Installation');

    const job = await call(sales, 'POST', '/jobs', {
      job_type_id: install.id,
      customer_name: 'ABC Mall',
      address: 'Jalan 1',
      scheduled_date: today(),
      scheduled_time: '09:30',
      technician_ids: [t1, t2],
    });
    assert.equal(job.status, 'assigned');
    assert.match(job.job_no, /^J\d{4}-\d{4}$/);

    const rem = await call(tech1, 'GET', '/reminders');
    assert.equal(rem.today.length, 1);

    await call(tech1, 'POST', `/jobs/${job.id}/status`, { status: 'in_progress' });
    const extras = await call(tech1, 'GET', '/extra-items');
    const welding = extras.find((e) => e.name === 'Welding work');
    await call(tech1, 'POST', `/jobs/${job.id}/extras`, { extra_item_id: welding.id, qty: 1 });

    // KIV must have a reason
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/status`, { status: 'kiv' }), /reason/);
    await call(tech1, 'POST', `/jobs/${job.id}/status`, { status: 'kiv', kiv_reason: 'Waiting customer confirm colour' });
    const kivList = await call(sales, 'GET', '/reminders');
    assert.equal(kivList.kiv.length, 1);

    // Salesman cannot sign before the technician submits the report
    await assert.rejects(call(sales, 'POST', `/jobs/${job.id}/salesman-signature`, { signature: 'data:image/png;base64,AA' }), /not submitted/);

    // Technician cannot mark the job as done, only submit the job report
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/status`, { status: 'completed' }), /cannot set status/);
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/submit-report`, {}), /work done/);
    const submitted = await call(tech1, 'POST', `/jobs/${job.id}/submit-report`, {
      work_done: 'Installed',
      technician_signature: 'data:image/png;base64,AA',
      customer_signature: 'data:image/png;base64,AA',
      customer_sign_name: 'Mr Tan',
    });
    assert.equal(submitted.status, 'in_progress');
    assert.ok(submitted.submitted_at);
    assert.equal(submitted.customer_sign_name, 'Mr Tan');
    assert.equal((await call(sales, 'GET', '/reminders')).awaiting_done.length, 1);

    const signed = await call(sales, 'POST', `/jobs/${job.id}/salesman-signature`, { signature: 'data:image/png;base64,AA' });
    assert.ok(signed.salesman_signed_at);
    const done = await call(sales, 'POST', `/jobs/${job.id}/status`, { status: 'completed' });
    assert.equal(done.status, 'completed');
    assert.equal(done.completed_at, submitted.submitted_at); // warranty runs from the technician's finish
    assert.equal(done.warranty_end, addMonths(today(), 12));
    assert.equal(done.work_done, 'Installed');
    assert.equal((await call(sales, 'GET', '/reminders')).awaiting_done.length, 0);

    await call(admin, 'POST', `/jobs/${job.id}/adjustments`, { technician_id: t2, amount: 15, reason: 'Extra trip for parts' });

    const report = await call(admin, 'GET', '/incentives');
    const r1 = report.technicians.find((t) => t.technician_id === t1);
    const r2 = report.technicians.find((t) => t.technician_id === t2);
    assert.equal(r1.total, 60 + 150); // senior install + welding per person
    assert.equal(r2.total, 40 + 150 + 15); // junior install + welding per person + adjustment
    assert.equal(report.grand_total, 415);

    // Technician only sees their own incentive; salesman sees none
    const own = await call(tech2, 'GET', '/incentives');
    assert.deepEqual(own.technicians.map((t) => t.technician_id), [t2]);
    await assert.rejects(call(sales, 'GET', '/incentives'), /Not allowed/);

    // Promotion later must not change past incentive
    await call(admin, 'PUT', `/users/${t2}`, { grade: 'senior' });
    const after = await call(admin, 'GET', '/incentives');
    assert.equal(after.technicians.find((t) => t.technician_id === t2).total, 205);
  } finally {
    server.close();
  }
});

test('service contract auto-creates job and rolls forward on completion', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const types = await call(admin, 'GET', '/job-types');
    const servicing = types.find((t) => t.name.startsWith('Servicing'));
    const c = await call(admin, 'POST', '/contracts', {
      customer_name: 'XYZ Hospital',
      job_type_id: servicing.id,
      interval_months: 3,
      start_date: today(),
    });
    const jobs = await call(admin, 'GET', '/jobs?status=pending');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].contract_id, c.id);

    // Running again must not duplicate
    const again = await call(admin, 'POST', '/contracts/run');
    assert.equal(again.created.length, 0);

    await finishJob(call, admin, jobs[0].id);
    const contracts = await call(admin, 'GET', '/contracts');
    assert.equal(contracts[0].next_service_date, addMonths(today(), 3));
  } finally {
    server.close();
  }
});

test('technician cannot open other technicians jobs', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const tech2 = await login('tech2', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const job = await call(admin, 'POST', '/jobs', { job_type_id: 1, customer_name: 'A', technician_ids: [t1] });
    await assert.rejects(call(tech2, 'GET', `/jobs/${job.id}`), /not assigned/);
    assert.equal((await call(tech2, 'GET', '/jobs')).length, 0);
  } finally {
    server.close();
  }
});

test('under-warranty job pays no incentive, and is detected from earlier job', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const types = await call(admin, 'GET', '/job-types');
    const install = types.find((t) => t.name === 'Installation');
    const servicing = types.find((t) => t.name.startsWith('Servicing'));
    const welding = (await call(admin, 'GET', '/extra-items')).find((e) => e.name === 'Welding work');

    const first = await call(admin, 'POST', '/jobs', { job_type_id: install.id, customer_name: 'ABC Mall', address: 'Lot 5', technician_ids: [t1] });
    await finishJob(call, admin, first.id);

    const hits = await call(admin, 'GET', `/jobs/warranty-check?customer=${encodeURIComponent(' abc mall ')}`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, first.id);

    const claim = await call(admin, 'POST', '/jobs', { job_type_id: servicing.id, customer_name: 'ABC Mall', technician_ids: [t1], under_warranty: true });
    await call(admin, 'POST', `/jobs/${claim.id}/extras`, { extra_item_id: welding.id });
    const done = await finishJob(call, admin, claim.id);
    assert.equal(done.incentive[0].total, 0);

    const report = await call(admin, 'GET', '/incentives');
    assert.equal(report.grand_total, 60); // only the first (non-warranty) installation
  } finally {
    server.close();
  }
});

test('incentive cap is split equally when many technicians share a job', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const u = await call(admin, 'POST', '/users', { name: `T${i}`, username: `t${i}`, password: 'secret1', role: 'technician', grade: i < 2 ? 'senior' : 'junior' });
      ids.push(u.id);
    }
    const install = (await call(admin, 'GET', '/job-types')).find((t) => t.name === 'Installation');
    await call(admin, 'PUT', `/job-types/${install.id}`, { incentive_cap: 150 });

    // 2 senior + 2 junior = 200 uncapped > 150 cap -> 37.50 each
    const big = await call(admin, 'POST', '/jobs', { job_type_id: install.id, customer_name: 'Glass Tower', technician_ids: ids });
    const done = await finishJob(call, admin, big.id);
    assert.deepEqual(done.incentive.map((l) => l.base), [37.5, 37.5, 37.5, 37.5]);
    assert.ok(done.incentive[0].capped);

    // 1 senior alone = 60 < 150 cap -> normal rate
    const small = await call(admin, 'POST', '/jobs', { job_type_id: install.id, customer_name: 'Shop', technician_ids: [ids[0]] });
    const done2 = await finishJob(call, admin, small.id);
    assert.equal(done2.incentive[0].base, 60);

    // per-job cap overrides the job type cap
    const custom = await call(admin, 'POST', '/jobs', { job_type_id: install.id, customer_name: 'Hotel', technician_ids: ids, incentive_cap: 100 });
    const done3 = await finishJob(call, admin, custom.id);
    assert.equal(done3.incentive[0].base, 25);
  } finally {
    server.close();
  }
});

test('salesman confirms KIV job and it returns to the schedule', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const t2 = users.find((u) => u.username === 'tech2').id;
    const job = await call(sales, 'POST', '/jobs', { job_type_id: 1, customer_name: 'KIV Co', scheduled_date: today(), technician_ids: [t1] });
    await call(tech1, 'POST', `/jobs/${job.id}/status`, { status: 'kiv', kiv_reason: 'Waiting quotation approval' });

    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/confirm-kiv`, { scheduled_date: today() }), /Not allowed/);
    await assert.rejects(call(sales, 'POST', `/jobs/${job.id}/confirm-kiv`, {}), /date/);

    const newDate = addMonths(today(), 1);
    const back = await call(sales, 'POST', `/jobs/${job.id}/confirm-kiv`, { scheduled_date: newDate, scheduled_time: '10:00', technician_ids: [t1, t2] });
    assert.equal(back.status, 'assigned');
    assert.equal(back.scheduled_date, newDate);
    assert.equal(back.scheduled_time, '10:00');
    assert.equal(back.kiv_reason, null);
    assert.equal(back.technicians.length, 2);
    assert.match(back.logs[0].note, /Waiting quotation approval/);
  } finally {
    server.close();
  }
});

test('service report fields are saved on posting and completion', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const tech1 = await login('tech1', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const job = await call(admin, 'POST', '/jobs', {
      job_type_id: 1,
      customer_name: 'Lily Lim',
      technician_ids: [t1],
      product_model: 'HH150 EASY',
      product_variant: 'DOUBLE',
      product_brand: 'GEWALT',
      inv_do_no: 'CS-003984',
      site_contact: 'Ahmad 012-3456789',
      outstation: true,
    });
    assert.equal(job.product_model, 'HH150 EASY');
    assert.equal(job.product_variant, 'DOUBLE');
    assert.equal(job.inv_do_no, 'CS-003984');
    assert.equal(job.outstation, 1);

    await call(tech1, 'POST', `/jobs/${job.id}/submit-report`, {
      work_done: 'Replaced remote receiver',
      night_work: true,
      customer_comment: 'Good service',
      technician_signature: 'data:image/png;base64,AA',
      accessories: { open_device: ['REMOTE CONTROL'], rail: '4.2 METER', motor: '100W CIRCLE' },
    });
    const done = await finishJob(call, admin, job.id);
    assert.equal(done.night_work, 1);
    assert.equal(done.customer_comment, 'Good service');
    assert.ok(done.technician_signature);
    assert.deepEqual(done.accessories.open_device, ['REMOTE CONTROL']);
    assert.equal(done.accessories.rail, '4.2 METER');
    assert.equal(done.inv_do_no, 'CS-003984'); // untouched by completion
  } finally {
    server.close();
  }
});

test('jobs can be found by INV/DO number, ignoring case, spaces and dashes', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const a = await call(admin, 'POST', '/jobs', { job_type_id: 1, customer_name: 'Lily Lim', inv_do_no: 'CS-003984' });
    await call(admin, 'POST', '/jobs', { job_type_id: 1, customer_name: 'Other Co', inv_do_no: 'CS-001111' });
    await finishJob(call, admin, a.id);

    for (const q of ['CS-003984', 'cs003984', 'cs 0039', '003984']) {
      const hits = await call(admin, 'GET', `/jobs?q=${encodeURIComponent(q)}`);
      assert.deepEqual(hits.map((h) => h.id), [a.id], q);
      assert.equal(hits[0].inv_do_no, 'CS-003984');
    }
  } finally {
    server.close();
  }
});

test('signatures are saved immediately, before the report is submitted', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123');
    const tech2 = await login('tech2', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const job = await call(sales, 'POST', '/jobs', { job_type_id: 1, customer_name: 'Sign Co', technician_ids: [t1] });

    await call(tech1, 'POST', `/jobs/${job.id}/signatures`, { technician_signature: 'data:image/png;base64,TT' });
    await call(tech1, 'POST', `/jobs/${job.id}/signatures`, { customer_signature: 'data:image/png;base64,CC', customer_sign_name: 'Mr Lee' });
    await assert.rejects(call(tech2, 'POST', `/jobs/${job.id}/signatures`, { technician_signature: 'data:image/png;base64,XX' }), /not assigned/);
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/signatures`, {}), /missing/);

    // Salesman sees both signatures without the technician having submitted
    const seen = await call(sales, 'GET', `/jobs/${job.id}`);
    assert.equal(seen.technician_signature, 'data:image/png;base64,TT');
    assert.equal(seen.customer_signature, 'data:image/png;base64,CC');
    assert.equal(seen.customer_sign_name, 'Mr Lee');

    // Submitting the report later without re-signing keeps them
    await call(tech1, 'POST', `/jobs/${job.id}/submit-report`, { work_done: 'Done' });

    // Salesman must sign before the job can be marked as done (admin too)
    await assert.rejects(call(sales, 'POST', `/jobs/${job.id}/status`, { status: 'completed' }), /must sign/);
    await assert.rejects(call(admin, 'POST', `/jobs/${job.id}/status`, { status: 'completed' }), /must sign/);
    await call(sales, 'POST', `/jobs/${job.id}/salesman-signature`, { signature: SIG });
    const done = await call(sales, 'POST', `/jobs/${job.id}/status`, { status: 'completed' });
    assert.equal(done.technician_signature, 'data:image/png;base64,TT');
    assert.equal(done.customer_signature, 'data:image/png;base64,CC');
  } finally {
    server.close();
  }
});

test('installed models summary groups completed jobs by model and door type', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const t2 = users.find((u) => u.username === 'tech2').id;
    const types = await call(admin, 'GET', '/job-types');
    const install = types.find((t) => t.name === 'Installation');
    const servicing = types.find((t) => t.name.startsWith('Servicing'));

    const post = (body) => call(admin, 'POST', '/jobs', { customer_name: 'C', ...body });
    const jobs = [
      await post({ job_type_id: install.id, product_model: 'HH100', product_variant: 'DOUBLE', technician_ids: [t1] }),
      await post({ job_type_id: install.id, product_model: 'HH100', product_variant: 'DOUBLE', technician_ids: [t2] }),
      await post({ job_type_id: install.id, product_model: 'HH100', product_variant: 'SINGLE', technician_ids: [t1] }),
      await post({ job_type_id: install.id, product_model: 'MAGIC DOOR', technician_ids: [t1] }),
      await post({ job_type_id: install.id, technician_ids: [t1] }), // no model recorded
      await post({ job_type_id: servicing.id, product_model: 'HH100', product_variant: 'DOUBLE', technician_ids: [t1] }),
    ];
    for (const j of jobs) await finishJob(call, admin, j.id);
    await post({ job_type_id: install.id, product_model: 'HH400' }); // not completed: excluded

    const r = await call(admin, 'GET', `/reports/installed?job_type_id=${install.id}`);
    assert.equal(r.total, 5);
    assert.deepEqual(
      r.by_model.map((g) => [g.model, g.variant, g.count]),
      [
        ['HH100', 'DOUBLE', 2],
        ['HH100', 'SINGLE', 1],
        ['MAGIC DOOR', null, 1],
        [null, null, 1],
      ]
    );
    assert.equal(r.by_model[0].jobs.length, 2);

    // All job types includes the servicing job
    assert.equal((await call(admin, 'GET', '/reports/installed')).total, 6);
    // Technician only sees their own jobs; salesman not allowed
    assert.equal((await call(tech1, 'GET', `/reports/installed?job_type_id=${install.id}`)).total, 4);
    await assert.rejects(call(sales, 'GET', '/reports/installed'), /Not allowed/);
    // Outside the period: nothing
    assert.equal((await call(admin, 'GET', '/reports/installed?from=2020-01-01&to=2020-01-31')).total, 0);
  } finally {
    server.close();
  }
});

test('admin setting controls whether salesmen see the installed models report', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const install = (await call(admin, 'GET', '/job-types')).find((t) => t.name === 'Installation');
    const byAdmin = await call(admin, 'POST', '/jobs', { job_type_id: install.id, customer_name: 'A', product_model: 'HH400' });
    const bySales = await call(sales, 'POST', '/jobs', { job_type_id: install.id, customer_name: 'B', product_model: 'HH350' });
    await finishJob(call, admin, byAdmin.id);
    await finishJob(call, admin, bySales.id);

    // Default: off
    assert.equal((await call(sales, 'GET', '/settings')).salesman_installed_report, 'off');
    await assert.rejects(call(sales, 'GET', '/reports/installed'), /Not allowed/);

    // Only admin can change it, and only to a valid value
    await assert.rejects(call(sales, 'PUT', '/settings', { salesman_installed_report: 'all' }), /Not allowed/);
    await assert.rejects(call(admin, 'PUT', '/settings', { salesman_installed_report: 'everyone' }), /must be one of/);
    await assert.rejects(call(admin, 'PUT', '/settings', { something_else: 'x' }), /Unknown setting/);

    await call(admin, 'PUT', '/settings', { salesman_installed_report: 'all' });
    assert.equal((await call(sales, 'GET', '/reports/installed')).total, 2);

    await call(admin, 'PUT', '/settings', { salesman_installed_report: 'own' });
    const own = await call(sales, 'GET', '/reports/installed');
    assert.equal(own.total, 1);
    assert.equal(own.by_model[0].model, 'HH350');

    await call(admin, 'PUT', '/settings', { salesman_installed_report: 'off' });
    await assert.rejects(call(sales, 'GET', '/reports/installed'), /Not allowed/);
  } finally {
    server.close();
  }
});

test('logins are case-insensitive and blocked after repeated wrong passwords', async () => {
  const { server, call, login } = await setup();
  try {
    assert.ok(await login('Admin', 'admin123')); // phones often capitalise the first letter
    for (let i = 0; i < 8; i++) await assert.rejects(login('tech1', 'wrong'), /Wrong username or password/);
    await assert.rejects(login('tech1', 'tech123'), /Too many wrong passwords/);
    // Other users are not affected
    assert.ok(await login('tech2', 'tech123'));
    // Fresh install starts with the RM200 installation limit
    const install = (await call(await login('admin', 'admin123'), 'GET', '/job-types')).find((t) => t.name === 'Installation');
    assert.equal(install.incentive_cap, 200);
  } finally {
    server.close();
  }
});

test('logins expire after the idle time set by admin; admin can log a user out everywhere', async () => {
  const { db, server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const tech = await login('tech1', 'tech123');
    const idle = (token, minutes) =>
      db.prepare(`UPDATE sessions SET last_used_at = datetime('now', 'localtime', ?) WHERE token = ?`).run(`-${minutes} minutes`, token);

    // Default 30 minutes: 29 idle minutes is fine (and resets the clock), 31 is not
    assert.equal((await call(admin, 'GET', '/settings')).session_idle_minutes, '30');
    idle(tech, 29);
    await call(tech, 'GET', '/me');
    idle(tech, 31);
    await assert.rejects(call(tech, 'GET', '/me'), /logged out after 30 minutes/);
    await assert.rejects(call(tech, 'GET', '/me'), /log in again/); // that login is gone

    // Admin loosens it to 8 hours
    await call(admin, 'PUT', '/settings', { session_idle_minutes: '480' });
    const tech2 = await login('tech1', 'tech123');
    idle(tech2, 120);
    await call(tech2, 'GET', '/me');

    // Lost phone: log out everywhere
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const r = await call(admin, 'POST', `/users/${t1}/logout-all`);
    assert.equal(r.logged_out, 1);
    await assert.rejects(call(tech2, 'GET', '/me'), /log in again/);
    const sales = await login('sales1', 'sales123');
    await assert.rejects(call(sales, 'POST', `/users/${t1}/logout-all`), /Not allowed/);

    // Deactivating a user also ends their logins
    const tech3 = await login('tech1', 'tech123');
    await call(admin, 'PUT', `/users/${t1}`, { active: false });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token = ?').get(tech3).n, 0);
  } finally {
    server.close();
  }
});

test('photos: technicians add, everyone on the job views, removal rules, limits', async () => {
  const { server, call, login, raw, photosDir } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123');
    const tech2 = await login('tech2', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const job = await call(sales, 'POST', '/jobs', { job_type_id: 1, customer_name: 'Photo Co', technician_ids: [t1] });

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
    const img = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    const added = await call(tech1, 'POST', `/jobs/${job.id}/photos`, { image: img, stage: 'before', caption: 'Broken sensor' });
    assert.equal(added.photos.length, 1);
    assert.equal(added.photos[0].caption, 'Broken sensor');
    assert.equal(added.photos[0].stage, 'before');
    const pid = added.photos[0].id;
    assert.equal(fs.readdirSync(path.join(photosDir, String(job.id))).length, 1);

    // Salesman can view the image bytes and the PDF-ready data URI
    const res = await raw(sales, `/jobs/${job.id}/photos/${pid}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), jpeg);
    assert.equal((await call(sales, 'GET', `/jobs/${job.id}/photos/${pid}?base64=1`)).data_uri, img);

    // Stage and description are required
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/photos`, { image: img, caption: 'No stage' }), /before or after/);
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/photos`, { image: img, stage: 'before' }), /describe/);

    // Not an image / other technician / not logged in
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/photos`, { image: 'data:image/jpeg;base64,aGVsbG8=', stage: 'before', caption: 'Bad' }), /not a valid image/);
    await assert.rejects(call(tech2, 'POST', `/jobs/${job.id}/photos`, { image: img, stage: 'before', caption: 'X1' }), /not assigned/);
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/jobs/${job.id}/photos/${pid}`)).status, 401);

    // A salesman can't remove the technician's evidence; the technician who took it can
    await assert.rejects(call(sales, 'DELETE', `/jobs/${job.id}/photos/${pid}`), /Only the person who took this photo/);

    // Once done: technicians can't add or remove; admin can
    await call(tech1, 'POST', `/jobs/${job.id}/photos`, { image: img, stage: 'after', caption: 'Door working' });
    await finishJob(call, admin, job.id);
    await assert.rejects(call(tech1, 'POST', `/jobs/${job.id}/photos`, { image: img, stage: 'after', caption: 'Late' }), /already done/);
    await assert.rejects(call(tech1, 'DELETE', `/jobs/${job.id}/photos/${pid}`), /already done/);
    const after = await call(admin, 'DELETE', `/jobs/${job.id}/photos/${pid}`);
    assert.equal(after.photos.length, 1);
    assert.equal(fs.readdirSync(path.join(photosDir, String(job.id))).length, 1);

    // Limit per job
    const job2 = await call(admin, 'POST', '/jobs', { job_type_id: 1, customer_name: 'Many' });
    for (let i = 0; i < 20; i++) await call(admin, 'POST', `/jobs/${job2.id}/photos`, { image: img, stage: 'after', caption: `Photo ${i}` });
    await assert.rejects(call(admin, 'POST', `/jobs/${job2.id}/photos`, { image: img, stage: 'after', caption: 'One more' }), /at most 20/);
  } finally {
    server.close();
  }
});

test('the last active admin cannot be switched off or demoted', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const me = (await call(admin, 'GET', '/users')).find((u) => u.username === 'admin');
    await assert.rejects(call(admin, 'PUT', `/users/${me.id}`, { active: false }), /only admin/);
    await assert.rejects(call(admin, 'PUT', `/users/${me.id}`, { role: 'salesman' }), /only admin/);

    // With a second admin it is allowed
    await call(admin, 'POST', '/users', { name: 'Office Manager', username: 'office', password: 'temp123', role: 'admin' });
    await call(admin, 'PUT', `/users/${me.id}`, { role: 'salesman' });
  } finally {
    server.close();
  }
});

test('staff change their own password; admin passwords are temporary until changed', async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    await assert.rejects(call(admin, 'POST', '/users', { name: 'Ali', username: 'ali', password: '123', role: 'technician', grade: 'junior' }), /at least 6/);
    const ali = await call(admin, 'POST', '/users', { name: 'Ali', username: 'ali', password: 'temp123', role: 'technician', grade: 'junior' });
    assert.equal(ali.must_change_password, 1);

    // First login: only allowed to change the temporary password
    const res = await call(null, 'POST', '/login', { username: 'ali', password: 'temp123' });
    assert.equal(res.user.must_change_password, 1);
    await assert.rejects(call(res.token, 'GET', '/jobs'), /change your temporary password/);
    await assert.rejects(call(res.token, 'POST', '/me/password', { current_password: 'wrong', new_password: 'mine4567' }), /Current password is wrong/);
    await assert.rejects(call(res.token, 'POST', '/me/password', { current_password: 'temp123', new_password: 'temp123' }), /different/);
    await call(res.token, 'POST', '/me/password', { current_password: 'temp123', new_password: 'mine4567' });
    assert.equal((await call(res.token, 'GET', '/me')).must_change_password, 0);
    await call(res.token, 'GET', '/jobs');
    await assert.rejects(login('ali', 'temp123'), /Wrong username or password/);
    assert.ok(await login('ali', 'mine4567'));

    // Admin reset makes it temporary again and logs the person out
    await call(admin, 'PUT', `/users/${ali.id}`, { password: 'reset999' });
    await assert.rejects(call(res.token, 'GET', '/me'), /log in again/);
    assert.equal((await call(null, 'POST', '/login', { username: 'ali', password: 'reset999' })).user.must_change_password, 1);

    // Changing your own password logs out your other phones but not this one
    const phone1 = await login('tech1', 'tech123');
    const phone2 = await login('tech1', 'tech123');
    await call(phone1, 'POST', '/me/password', { current_password: 'tech123', new_password: 'newtech1' });
    await call(phone1, 'GET', '/me');
    await assert.rejects(call(phone2, 'GET', '/me'), /log in again/);
  } finally {
    server.close();
  }
});

test("a leaver's unfinished jobs move to another person in one step", async () => {
  const { server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const id = (n) => users.find((u) => u.username === n).id;
    const [t1, t2, s1, a] = [id('tech1'), id('tech2'), id('sales1'), id('admin')];
    const welding = (await call(admin, 'GET', '/extra-items')).find((e) => e.name === 'Welding work');

    const post = (body) => call(sales, 'POST', '/jobs', { job_type_id: 1, customer_name: 'C', ...body });
    const open1 = await post({ technician_ids: [t1] });
    const shared = await post({ technician_ids: [t1, t2] });
    const kiv = await post({ technician_ids: [t1] });
    const submitted = await post({ technician_ids: [t1] });
    const done = await post({ technician_ids: [t1] });
    await call(tech1, 'POST', `/jobs/${open1.id}/extras`, { extra_item_id: welding.id, technician_id: t1 });
    await call(tech1, 'POST', `/jobs/${kiv.id}/status`, { status: 'kiv', kiv_reason: 'Waiting' });
    await call(tech1, 'POST', `/jobs/${submitted.id}/submit-report`, { work_done: 'Done by tech1' });
    await finishJob(call, admin, done.id);

    const list = await call(admin, 'GET', `/users/${t1}/open-jobs`);
    assert.deepEqual(list.jobs.map((j) => j.id).sort(), [open1.id, shared.id, kiv.id].sort());

    await assert.rejects(call(admin, 'POST', `/users/${t1}/move-open-jobs`, { to_user_id: s1 }), /another technician/);
    await assert.rejects(call(sales, 'POST', `/users/${t1}/move-open-jobs`, { to_user_id: t2 }), /Not allowed/);
    assert.equal((await call(admin, 'POST', `/users/${t1}/move-open-jobs`, { to_user_id: t2 })).moved, 3);

    const techsOf = async (jobId) => (await call(admin, 'GET', `/jobs/${jobId}`)).technicians.map((t) => t.id);
    assert.deepEqual(await techsOf(open1.id), [t2]);
    assert.deepEqual(await techsOf(shared.id), [t2]); // not added twice
    assert.deepEqual(await techsOf(kiv.id), [t2]);
    assert.deepEqual(await techsOf(submitted.id), [t1]); // submitted work stays with tech1
    assert.deepEqual(await techsOf(done.id), [t1]);
    const ext = (await call(admin, 'GET', `/jobs/${open1.id}`)).extras[0];
    assert.equal(ext.technician_id, t2);
    assert.match((await call(admin, 'GET', `/jobs/${open1.id}`)).logs[0].note, /Moved from Senior Tech to Junior Tech/);

    // Salesman leaving: their open jobs go to admin
    const moved = await call(admin, 'POST', `/users/${s1}/move-open-jobs`, { to_user_id: a });
    assert.equal(moved.moved, 4); // open1, shared, kiv, submitted (done is excluded)
    assert.equal((await call(admin, 'GET', `/jobs/${submitted.id}`)).salesman_id, a);
    assert.equal((await call(admin, 'GET', `/jobs/${done.id}`)).salesman_id, s1);
  } finally {
    server.close();
  }
});

test('service report: preview for review, PDF only after salesman signs, Excel downloads', async () => {
  const { server, call, login, raw } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const job = await call(sales, 'POST', '/jobs', { job_type_id: 1, customer_name: 'Report Co', inv_do_no: 'CS-1', product_model: 'HH100', technician_ids: [t1] });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    await call(tech1, 'POST', `/jobs/${job.id}/photos`, { image: `data:image/jpeg;base64,${jpeg.toString('base64')}`, stage: 'before', caption: 'Broken sensor' });
    await call(tech1, 'POST', `/jobs/${job.id}/submit-report`, { work_done: 'Fixed' });

    // Preview: shows the report and photo descriptions, marked as not yet signed
    const preview = await (await raw(sales, `/jobs/${job.id}/report.html`)).text();
    assert.match(preview, /SERVICE REPORT/);
    assert.match(preview, /Report Co/);
    assert.match(preview, /BEFORE SERVICE/);
    assert.match(preview, /Broken sensor/);
    assert.match(preview, /PREVIEW – not signed/);

    // PDF locked until the salesman signs
    assert.equal((await raw(sales, `/jobs/${job.id}/report.pdf`)).status, 403);
    await call(sales, 'POST', `/jobs/${job.id}/salesman-signature`, { signature: SIG });
    const pdf = await raw(sales, `/jobs/${job.id}/report.pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

    // Excel downloads (xlsx files are zip archives: start with "PK")
    await call(sales, 'POST', `/jobs/${job.id}/status`, { status: 'completed' });
    for (const [token, path] of [
      [admin, '/export/jobs.xlsx?q=CS-1'],
      [admin, '/export/incentives.xlsx'],
      [admin, '/export/installed.xlsx'],
    ]) {
      const r = await raw(token, path);
      assert.equal(r.status, 200, path);
      assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 2).toString(), 'PK', path);
    }
    assert.equal((await raw(sales, '/export/incentives.xlsx')).status, 403);
    assert.equal((await raw(tech1, '/export/jobs.xlsx')).status, 403);

    // Office table filters
    assert.equal((await call(admin, 'GET', `/jobs?technician_id=${t1}`)).length, 1);
    assert.equal((await call(admin, 'GET', `/jobs?salesman_id=${t1}`)).length, 0);
    const listed = (await call(admin, 'GET', '/jobs?q=CS-1'))[0];
    assert.equal(listed.product_model, 'HH100');
    assert.equal(listed.salesman_name, 'Sample Salesman');
  } finally {
    server.close();
  }
});

test('opening Today creates due contract jobs (no timer needed), once, at most hourly', async () => {
  const { db, server, call, login } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const tech = await login('tech1', 'tech123');
    const servicing = (await call(admin, 'GET', '/job-types')).find((t) => t.name.startsWith('Servicing'));
    const addContract = (name) =>
      db
        .prepare(
          `INSERT INTO service_contracts (customer_name, job_type_id, interval_months, start_date, next_service_date)
           VALUES (?, ?, 3, ?, ?)`
        )
        .run(name, servicing.id, today(), today());
    const jobCount = () => db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;

    addContract('Opened Co');
    assert.equal(jobCount(), 0); // nothing yet: no timer ran

    // Any user opening Today (here a technician) triggers the check
    await call(tech, 'GET', '/reminders');
    assert.equal(jobCount(), 1);
    const job = db.prepare('SELECT * FROM jobs').get();
    assert.equal(job.customer_name, 'Opened Co');
    assert.ok(job.contract_id);

    // Opening again never makes a second job for the same due date
    await call(admin, 'GET', '/reminders');
    assert.equal(jobCount(), 1);
    assert.equal((await call(admin, 'GET', '/reminders')).unassigned.length, 1);

    // Throttled: a contract added straight after is picked up by the next check an hour later
    addContract('Later Co');
    await call(admin, 'GET', '/reminders');
    assert.equal(jobCount(), 1);
    await call(admin, 'POST', '/contracts/run'); // admin can still run it by hand
    assert.equal(jobCount(), 2);
  } finally {
    server.close();
  }
});

test('incentive statement for the staff meeting: admin only, no customer names, warranty jobs at RM0', async () => {
  const { server, call, login, raw } = await setup();
  try {
    const admin = await login('admin', 'admin123');
    const sales = await login('sales1', 'sales123');
    const tech1 = await login('tech1', 'tech123');
    const users = await call(admin, 'GET', '/users');
    const t1 = users.find((u) => u.username === 'tech1').id;
    const types = await call(admin, 'GET', '/job-types');
    const install = types.find((t) => t.name === 'Installation');
    const servicing = types.find((t) => t.name.startsWith('Servicing'));

    const paid = await call(admin, 'POST', '/jobs', { job_type_id: install.id, customer_name: 'Secret Customer Sdn Bhd', address: 'Hidden Road 1', inv_do_no: 'INV-777', technician_ids: [t1] });
    await finishJob(call, admin, paid.id);
    const claim = await call(admin, 'POST', '/jobs', { job_type_id: servicing.id, customer_name: 'Secret Customer Sdn Bhd', technician_ids: [t1], under_warranty: true });
    await finishJob(call, admin, claim.id);

    const html = await (await raw(admin, '/incentives/statement.pdf?format=html')).text();
    assert.match(html, /TECHNICIAN INCENTIVE STATEMENT/);
    assert.match(html, /INV-777/);
    assert.match(html, new RegExp((await call(admin, 'GET', `/jobs/${paid.id}`)).job_no));
    assert.match(html, /Under warranty – no incentive/);
    assert.match(html, /GRAND TOTAL<\/td><td class="r">RM 60\.00/);
    assert.doesNotMatch(html, /Secret Customer|Hidden Road/);

    const pdf = await raw(admin, '/incentives/statement.pdf');
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

    assert.equal((await raw(sales, '/incentives/statement.pdf')).status, 403);
    assert.equal((await raw(tech1, '/incentives/statement.pdf')).status, 403);
  } finally {
    server.close();
  }
});
