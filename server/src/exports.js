// Excel downloads for the office: job list, incentive (summary + per-job breakdown), installed models.
import ExcelJS from 'exceljs';

const STATUS = {
  pending: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  kiv: 'KIV',
  completed: 'Done',
  cancelled: 'Cancelled',
};

function sheet(wb, name, columns) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(([header, key, width, numFmt]) => ({ header, key, width, style: numFmt ? { numFmt } : {} }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF182250' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

const RM = '"RM "#,##0.00';

export async function jobsWorkbook(jobs) {
  const wb = new ExcelJS.Workbook();
  const ws = sheet(wb, 'Jobs', [
    ['Job no.', 'job_no', 13],
    ['Date', 'scheduled_date', 12],
    ['Time', 'scheduled_time', 7],
    ['Customer', 'customer_name', 28],
    ['INV / DO No.', 'inv_do_no', 14],
    ['Job type', 'job_type', 22],
    ['Model', 'model', 20],
    ['Address', 'address', 32],
    ['Technicians', 'technicians', 22],
    ['Salesman', 'salesman_name', 16],
    ['Status', 'status', 12],
    ['Done on', 'completed_at', 17],
    ['Warranty until', 'warranty_end', 14],
  ]);
  for (const j of jobs) {
    ws.addRow({
      ...j,
      model: [j.product_model, j.product_variant].filter(Boolean).join(' '),
      status: j.status === 'in_progress' && j.submitted_at ? 'Waiting salesman' : STATUS[j.status] ?? j.status,
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function incentiveWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  const sum = sheet(wb, 'Summary', [
    ['Technician', 'name', 22],
    ['Grade', 'grade', 9],
    ['Jobs', 'job_count', 7],
    ['Base', 'base_total', 13, RM],
    ['Extras (welding etc.)', 'extras_total', 18, RM],
    ['Adjustments', 'adjustments_total', 14, RM],
    ['Total', 'total', 14, RM],
  ]);
  for (const t of report.technicians) sum.addRow(t);
  const totalRow = sum.addRow({ name: `Company total ${report.from} to ${report.to}`, total: report.grand_total });
  totalRow.font = { bold: true };

  const det = sheet(wb, 'Per job', [
    ['Technician', 'tech', 20],
    ['Grade', 'grade', 9],
    ['Job no.', 'job_no', 13],
    ['Done on', 'done', 12],
    ['Customer', 'customer_name', 26],
    ['Job type', 'job_type', 22],
    ['Base', 'base', 11, RM],
    ['Extras', 'extras_amount', 11, RM],
    ['Extras detail', 'extras_detail', 30],
    ['Adjustments', 'adj_amount', 12, RM],
    ['Adjustment reason', 'adj_detail', 30],
    ['Total', 'total', 12, RM],
  ]);
  for (const t of report.technicians) {
    for (const j of t.jobs) {
      det.addRow({
        tech: t.name,
        grade: t.grade,
        job_no: j.job_no,
        done: j.completed_at?.slice(0, 10),
        customer_name: j.customer_name,
        job_type: j.job_type,
        base: j.base,
        extras_amount: j.extras.reduce((s, e) => s + e.amount, 0),
        extras_detail: j.extras.map((e) => `${e.name} x${e.qty}`).join(', '),
        adj_amount: j.adjustments.reduce((s, a) => s + a.amount, 0),
        adj_detail: j.adjustments.map((a) => a.reason).join('; '),
        total: j.total,
      });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function installedWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  const sum = sheet(wb, 'By model', [
    ['Model', 'model', 22],
    ['Door', 'variant', 10],
    ['Count', 'count', 8],
  ]);
  for (const g of report.by_model) sum.addRow({ model: g.model ?? 'Not recorded', variant: g.variant ?? '', count: g.count });
  sum.addRow({ model: `Total ${report.from} to ${report.to}`, count: report.total }).font = { bold: true };
  const det = sheet(wb, 'Jobs', [
    ['Model', 'model', 22],
    ['Door', 'variant', 10],
    ['Job no.', 'job_no', 13],
    ['Done on', 'done', 12],
    ['Customer', 'customer_name', 26],
    ['INV / DO No.', 'inv_do_no', 14],
    ['Address', 'address', 30],
    ['Technicians', 'technicians', 22],
  ]);
  for (const g of report.by_model) {
    for (const j of g.jobs) det.addRow({ ...j, model: g.model ?? 'Not recorded', variant: g.variant ?? '', done: j.completed_at?.slice(0, 10) });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
