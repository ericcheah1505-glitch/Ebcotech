// Incentive statement for a period – printed by the admin for the staff meeting, as proof of how
// every technician's incentive was worked out. Only job no. and INV/DO no. identify a job (no
// customer names or addresses), since the printout is shown to everyone. Under-warranty jobs are
// listed at RM0 so technicians can see every job was counted.
import { COMPANY, COMPANY_NAME, esc, LOGO_DATA_URI, niceDate } from './report.js';

const rm = (n) => `RM ${Number(n || 0).toFixed(2)}`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function chart(technicians) {
  const max = Math.max(...technicians.map((t) => t.total), 1);
  return technicians
    .map(
      (t) => `<div class="bar-row">
        <div class="bar-name">${esc(t.name)}</div>
        <div class="bar-track"><div class="bar" style="width:${Math.max((t.total / max) * 100, t.total > 0 ? 1.5 : 0).toFixed(1)}%"></div></div>
        <div class="bar-val">${rm(t.total)}</div>
      </div>`
    )
    .join('');
}

// What made up one job's amount, in words, e.g. "Rate RM60.00 · Welding work x1 RM150.00".
function workings(j) {
  if (j.under_warranty) {
    const adj = j.adjustments.map((a) => `Adjustment ${rm(a.amount)} (${esc(a.reason)})`);
    return ['Under warranty – no incentive', ...adj].join(' · ');
  }
  const parts = [`${j.capped ? 'Share of job limit' : `${cap(j.grade)} rate`} ${rm(j.base)}`];
  for (const e of j.extras) if (e.amount) parts.push(`${esc(e.name)} ×${e.qty} ${rm(e.amount)}${e.note ? ` (${esc(e.note)})` : ''}`);
  for (const a of j.adjustments) parts.push(`Adjustment ${rm(a.amount)} (${esc(a.reason)})`);
  return parts.join(' · ');
}

function techSection(t) {
  const rows = t.jobs
    .map(
      (j, i) => `<tr${j.under_warranty ? ' class="warranty"' : ''}>
        <td class="c">${i + 1}</td>
        <td>${niceDate(j.completed_at)}</td>
        <td>${esc(j.job_no)}</td>
        <td>${esc(j.inv_do_no || '-')}</td>
        <td>${esc(j.job_type)}</td>
        <td class="small">${workings(j)}</td>
        <td class="r">${rm(j.total)}</td>
      </tr>`
    )
    .join('');
  return `<section class="tech">
    <h3>${esc(t.name)} <span class="muted">· ${cap(t.grade)} technician · ${t.job_count} job(s)</span></h3>
    <table class="jobs">
      <thead><tr><th class="c">#</th><th>Date done</th><th>Job no.</th><th>INV / DO no.</th><th>Job type</th><th>How the amount is made up</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="6" class="r">Subtotal – ${esc(t.name)}</td><td class="r">${rm(t.total)}</td></tr></tfoot>
    </table>
  </section>`;
}

export function statementHtml(report, generatedAt) {
  const { technicians } = report;
  const jobCount = new Set(technicians.flatMap((t) => t.jobs.map((j) => j.job_id))).size;
  const summaryRows = technicians
    .map(
      (t, i) => `<tr><td class="c">${i + 1}</td><td>${esc(t.name)}</td><td>${cap(t.grade)}</td><td class="c">${t.job_count}</td>
        <td class="r">${rm(t.base_total)}</td><td class="r">${rm(t.extras_total)}</td><td class="r">${rm(t.adjustments_total)}</td><td class="r b">${rm(t.total)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    @page { size: A4; margin: 14mm 12mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, 'Noto Sans', 'Noto Sans CJK SC', sans-serif; color: #111; font-size: 11px; margin: 0; }
    .head { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; }
    .head img { height: 46px; }
    .co { font-size: 15px; font-weight: 700; }
    .co small { font-weight: 400; font-size: 11px; }
    .muted { color: #666; font-weight: 400; }
    h1 { font-size: 20px; margin: 14px 0 2px; letter-spacing: .5px; }
    h2 { font-size: 14px; margin: 18px 0 8px; }
    h3 { font-size: 13px; margin: 0 0 6px; }
    .period { font-size: 13px; }
    .tiles { display: flex; gap: 10px; margin: 12px 0 4px; }
    .tile { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }
    .tile .v { font-size: 20px; font-weight: 800; }
    .bar-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
    .bar-name { width: 110px; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .bar-track { flex: 1; background: #f1f1f1; height: 18px; border-radius: 3px; }
    .bar { background: #1f6f43; height: 18px; border-radius: 3px; }
    .bar-val { width: 80px; text-align: right; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 4px 5px; vertical-align: top; }
    th { background: #eee; text-align: left; font-size: 10px; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .b { font-weight: 700; }
    .small { font-size: 9.5px; color: #333; }
    tfoot td, .grand td { font-weight: 700; background: #f6f6f6; }
    tr { page-break-inside: avoid; }
    tr.warranty td { color: #777; }
    .details { page-break-before: always; }
    .tech { margin-bottom: 16px; page-break-inside: auto; }
    .tech h3 { page-break-after: avoid; }
    .note { font-size: 10px; color: #444; margin-top: 6px; }
    .sign { display: flex; gap: 40px; margin-top: 36px; page-break-inside: avoid; }
    .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; }
    .empty { margin-top: 30px; font-size: 13px; }
  </style></head><body>
    <div class="head">
      <img src="${LOGO_DATA_URI}"/>
      <div class="co">${COMPANY_NAME} <small>${COMPANY.chinese} ${COMPANY.regNo}</small><br/><span class="muted" style="font-size:10px">${COMPANY.address}</span></div>
    </div>
    <h1>TECHNICIAN INCENTIVE STATEMENT</h1>
    <div class="period">Period: <b>${niceDate(report.from)} – ${niceDate(report.to)}</b> <span class="muted">(jobs marked done in this period)</span></div>
    ${
      technicians.length === 0
        ? '<div class="empty">No completed jobs in this period.</div>'
        : `<div class="tiles">
      <div class="tile"><div class="muted">Total incentive</div><div class="v">${rm(report.grand_total)}</div></div>
      <div class="tile"><div class="muted">Completed jobs</div><div class="v">${jobCount}</div></div>
      <div class="tile"><div class="muted">Technicians</div><div class="v">${technicians.length}</div></div>
    </div>
    <h2>Incentive by technician</h2>
    ${chart(technicians)}
    <h2>Summary</h2>
    <table>
      <thead><tr><th class="c">#</th><th>Technician</th><th>Grade</th><th class="c">Jobs</th><th class="r">Job rates</th><th class="r">Extras</th><th class="r">Adjustments</th><th class="r">Total</th></tr></thead>
      <tbody>${summaryRows}</tbody>
      <tbody class="grand"><tr><td colspan="7" class="r">GRAND TOTAL</td><td class="r">${rm(report.grand_total)}</td></tr></tbody>
    </table>
    <div class="note">Job rates follow the job type and the technician's grade (senior / junior) on the day the job was done.
      When a job has a limit (e.g. installation RM200) and the team's rates add up to more, the limit is shared equally.
      Under-warranty jobs earn no incentive and are listed at RM0. Each line can be checked in the system by job no. or INV / DO no.</div>
    <div class="details">
      <h2 style="margin-top:0">Job details per technician</h2>
      ${technicians.map(techSection).join('')}
    </div>`
    }
    <div class="sign">
      <div>Prepared by (name, signature, date)</div>
      <div>Approved by (name, signature, date)</div>
    </div>
    <div class="note">Generated from the Ebcotech job system on ${niceDate(generatedAt)} at ${generatedAt.slice(11, 16)}.</div>
  </body></html>`;
}

// Page numbers at the bottom of every page.
export const STATEMENT_PDF_OPTIONS = {
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font:9px Arial;color:#666;text-align:center">Incentive statement · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
};
