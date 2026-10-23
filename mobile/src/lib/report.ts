import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  CONTROLLERS,
  DOOR_VARIANTS,
  HOUSE_BRAND,
  MOTORS,
  OPEN_DEVICES,
  PRODUCT_MODELS,
  RAIL_LENGTHS,
  type Accessories,
} from './catalog';
import { niceDate } from './format';
import { LOGO_DATA_URI } from './logo';
import { api } from './api';
import type { JobDetail } from './types';

export const COMPANY_NAME = 'EBCOTECH MACHINERY';

// Company details printed on the service report header (from the paper form).
const COMPANY = {
  chinese: '德科德機械有限公司',
  regNo: '(833774-U)',
  address: 'No 1, Jalan Gangsa SD5/3A, Bandar Sri Damansara, 52200 K.L., Malaysia.',
  phones: 'Tel. (6) 03-6280 6226, 03-6280 6228 &nbsp; Fax. (6) 03-6280 6222',
  helpline: 'Customer Service Helpline: (6) 03-6280 6221',
  web: 'www.gwgewalt.com',
};

// A4 page in points (expo-print defaults to US Letter).
const A4 = { width: 595, height: 842 };

const esc = (s?: string | null) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

const box = (checked: boolean, label: string) =>
  `<span class="opt"><span class="cb">${checked ? '&#10003;' : ''}</span>${label}</span>`;

// Row of tick boxes for a fixed list, plus OTHERS with the free text when the value isn't listed.
function choiceRow(options: string[], value: string | null | undefined, withOthers = true) {
  const v = value?.trim() || '';
  const other = v && !options.includes(v) ? v : '';
  return (
    options.map((o) => box(v === o, esc(o))).join('') +
    (withOthers ? box(!!other, `OTHERS <span class="fill line-in">${esc(other)}</span>`) : '')
  );
}

const time = (stamp?: string | null) => (stamp ? stamp.slice(11, 16) : '');

export type ReportPhoto = { data_uri: string; caption: string | null; stage: 'before' | 'after' | null };
const PHOTOS_PER_PAGE = 4;
const PHOTO_GROUPS = [
  { stage: 'before', title: 'BEFORE SERVICE', label: 'Before', color: '#B45309' },
  { stage: 'after', title: 'AFTER SERVICE', label: 'After', color: '#15803D' },
  { stage: null, title: 'OTHER PHOTOS', label: 'Photo', color: '#444' },
] as const;

// Attachments: Before-service photos, then After-service photos, 4 per A4 page with descriptions.
function attachmentsHtml(job: JobDetail, photos: ReportPhoto[]) {
  const pages: { group: (typeof PHOTO_GROUPS)[number]; items: ReportPhoto[]; first: number; page: number; of: number }[] = [];
  for (const group of PHOTO_GROUPS) {
    const items = photos.filter((ph) => (group.stage ? ph.stage === group.stage : ph.stage !== 'before' && ph.stage !== 'after'));
    const count = Math.ceil(items.length / PHOTOS_PER_PAGE);
    for (let i = 0; i < count; i++) {
      pages.push({ group, items: items.slice(i * PHOTOS_PER_PAGE, (i + 1) * PHOTOS_PER_PAGE), first: i * PHOTOS_PER_PAGE, page: i + 1, of: count });
    }
  }
  return pages
    .map(
      ({ group, items, first, page, of }) => `
    <div class="attach">
      <div class="attach-head">
        <img class="attach-logo" src="${LOGO_DATA_URI}"/>
        <div>Service Report No. <b class="red">${esc(job.job_no)}</b> · ${esc(job.customer_name)}</div>
      </div>
      <div class="stage" style="color:${group.color};border-color:${group.color}">
        ATTACHMENT – ${group.title}${of > 1 ? ` <span class="muted">(page ${page} of ${of})</span>` : ''}
      </div>
      <div class="grid">
        ${items
          .map(
            (ph, i) => `
          <figure>
            <div class="frame"><img src="${ph.data_uri}"/></div>
            <figcaption><b>${group.label} ${first + i + 1}:</b> ${esc(ph.caption) || '&nbsp;'}</figcaption>
          </figure>`
          )
          .join('')}
      </div>
    </div>`
    )
    .join('');
}

export function reportHtml(job: JobDetail, photos: ReportPhoto[] = []) {
  const acc: Accessories = job.accessories ?? {};
  // Technicians no longer fill in accessories; only older jobs that recorded them show the section.
  const hasAccessories =
    (acc.open_device?.length ?? 0) > 0 || [acc.open_device_other, acc.rail, acc.rail_cover, acc.motor, acc.controller, acc.others].some((v) => v?.trim());
  const devices = acc.open_device ?? [];
  const type = job.job_type.toLowerCase();
  const isNew = type.includes('install');
  const isService = type.includes('servic');
  const otherType = isNew || isService ? '' : job.job_type;
  const techs = job.technicians.map((t) => t.name).join(' / ');
  const installDate = job.completed_at ?? job.scheduled_date;

  const row = (label: string, content: string) => `<tr><th>${label}</th><td>${content}</td></tr>`;
  const fill = (text?: string | null) => `<span class="fill">${esc(text) || '&nbsp;'}</span>`;
  const sig = (title: string, img: string | null, name?: string | null, date?: string | null) => `
    <div class="sig">
      <div class="sigbox">${img ? `<img src="${img}"/>` : ''}</div>
      <div class="sigline">${title}</div>
      <div class="muted">${esc(name) || '&nbsp;'}${date ? ` · ${niceDate(date)}` : ''}</div>
    </div>`;

  const problems = [
    job.description ? `<div class="fill">${esc(job.description)}</div>` : '',
    job.work_done ? `<div><b>Work done:</b> <span class="fill">${esc(job.work_done)}</span></div>` : '',
    job.extras.length
      ? `<div><b>Additional work:</b> <span class="fill">${job.extras.map((e) => `${esc(e.name)} x${e.qty}${e.note ? ` (${esc(e.note)})` : ''}`).join(', ')}</span></div>`
      : '',
    job.remarks ? `<div><b>Remarks:</b> <span class="fill">${esc(job.remarks)}</span></div>` : '',
    job.warranty_end ? `<div><b>Warranty until:</b> <span class="fill">${niceDate(job.warranty_end)}</span></div>` : '',
  ].join('');

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 22px 28px; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 10.5px; color: #111; margin: 0; }
    .head { display: flex; gap: 14px; align-items: flex-start; }
    .brand .logo { display: block; width: 200px; height: auto; }
    .brand .cn { color: #1f5fae; font-size: 12px; letter-spacing: 6px; margin-top: 2px; }
    .brand .reg { font-size: 8px; margin-left: 60px; }
    .addr { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #222; padding-top: 4px; line-height: 1.4; }
    .addr .help { font-size: 11px; }
    .title { display: flex; justify-content: space-between; align-items: flex-end; margin: 6px 0 10px; }
    .title h1 { margin: 0; color: #1f5fae; font-size: 18px; font-weight: 700; }
    .title .no { font-size: 15px; }
    .title .no b { color: #d6342c; font-size: 20px; letter-spacing: 1px; font-family: Arial, Helvetica, sans-serif; }
    table.form { width: 100%; border-collapse: collapse; }
    table.form th { width: 31%; text-align: left; font-weight: normal; vertical-align: top; padding: 3px 4px 3px 0; text-transform: uppercase; }
    table.form td { padding: 3px 0; vertical-align: top; }
    .opt { display: inline-block; margin: 0 14px 3px 0; white-space: nowrap; }
    .cb { display: inline-block; width: 10px; height: 10px; border: 1px solid #111; margin-right: 4px; vertical-align: -1px;
          text-align: center; line-height: 10px; font-size: 11px; font-weight: 700; color: #1f3fa0; font-family: Arial, sans-serif; }
    .fill { color: #1f3fa0; font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; }
    .line-in { display: inline-block; min-width: 110px; border-bottom: 1px solid #111; }
    .uline { display: inline-block; border-bottom: 1px solid #111; min-width: 240px; padding: 0 2px; }
    .box { border: 1.2px solid #111; padding: 4px 6px; margin-top: 8px; }
    .box .lbl { text-transform: uppercase; }
    .problems { min-height: 270px; }
    .problems.tall { min-height: 440px; }
    .comment { min-height: 85px; }
    .problems div { margin: 3px 0; }
    .sigs { display: flex; gap: 22px; margin-top: 16px; }
    .sig { flex: 1; text-align: center; font-family: Arial, Helvetica, sans-serif; }
    .sigbox { height: 62px; display: flex; align-items: flex-end; justify-content: center; }
    .sigbox img { max-height: 62px; max-width: 100%; }
    .sigline { border-top: 1px solid #111; padding-top: 3px; font-weight: 700; font-size: 10px; }
    .muted { color: #555; font-size: 9px; }
    .attach { page-break-before: always; break-before: page; font-family: Arial, Helvetica, sans-serif; }
    .attach-head { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; font-size: 11px; }
    .stage { font-weight: 800; font-size: 14px; letter-spacing: 0.5px; border-left: 5px solid; padding: 2px 8px; margin-bottom: 10px; }
    .attach-logo { width: 110px; }
    .red { color: #d6342c; }
    .grid { display: flex; flex-wrap: wrap; gap: 14px; }
    figure { margin: 0; width: calc(50% - 7px); break-inside: avoid; }
    .frame { height: 350px; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; background: #f7f7f7; }
    .frame img { max-width: 100%; max-height: 100%; }
    figcaption { font-size: 10px; margin-top: 4px; min-height: 14px; }
  </style></head><body>
    <div class="head">
      <div class="brand">
        <img class="logo" src="${LOGO_DATA_URI}" alt="${COMPANY_NAME}"/>
        <div class="cn">${COMPANY.chinese}</div>
        <div class="reg">${COMPANY.regNo}</div>
      </div>
      <div class="addr">
        ${COMPANY.address}<br/>${COMPANY.phones}<br/>
        <span class="help">${COMPANY.helpline}</span><br/>${COMPANY.web}
      </div>
    </div>
    <div class="title">
      <h1>SERVICE REPORT</h1>
      <div class="no">No. <b>${esc(job.job_no)}</b></div>
    </div>
    <table class="form">
      ${row('Product type :', choiceRow(PRODUCT_MODELS, job.product_model))}
      ${row('Door :', DOOR_VARIANTS.map((v) => box(job.product_variant === v, `${v} DOOR`)).join(''))}
      ${row('Product brand :', box(job.product_brand === HOUSE_BRAND, 'HOUSE BRAND GEWALT') + box(!!job.product_brand && job.product_brand !== HOUSE_BRAND, `OTHERS <span class="fill line-in">${job.product_brand && job.product_brand !== HOUSE_BRAND ? esc(job.product_brand) : ''}</span>`))}
      ${row('Job type :', box(isNew, 'NEW') + box(isService, 'SERVICE') + box(!!job.under_warranty, 'WARANTY') + box(false, 'F.O.C') + box(!!otherType, `OTHERS <span class="fill line-in">${esc(otherType)}</span>`))}
      ${row('Working time :', box(!job.night_work && job.status === 'completed', 'NORMAL HOUR') + box(!!job.night_work, `NIGHT WORK FROM <span class="fill line-in" style="min-width:50px">${job.night_work ? time(job.started_at) : ''}</span> UNTIL <span class="fill line-in" style="min-width:50px">${job.night_work ? time(job.completed_at) : ''}</span>`))}
      ${row('Invoice customer name :', `<span class="uline fill">${esc(job.customer_name)}</span> &nbsp; INV /DO NO : <span class="fill line-in">${esc(job.inv_do_no)}</span>`)}
      ${row('Site contact (name, phone) :', `<span class="uline">${fill(job.site_contact || job.customer_phone)}</span>`)}
      ${row('Owner name :', `<span class="uline">${fill(job.owner_name)}</span>`)}
      ${row('Site location (address) :', `<span class="uline" style="min-width:290px">${fill(job.address)}</span> &nbsp; ${box(!!job.outstation, 'OUTSTATION')}${box(!job.outstation, 'LOCAL')}`)}
      ${row('Install date :', `<span class="uline">${fill(installDate ? niceDate(installDate) : '')}</span>`)}
      ${row('Technical person :', `<span class="uline">${fill(techs)}</span>`)}
      ${
        hasAccessories
          ? [
              row('Accessories: open device :', OPEN_DEVICES.map((d) => box(devices.includes(d), esc(d))).join('') + box(!!acc.open_device_other, `OTHERS <span class="fill line-in">${esc(acc.open_device_other)}</span>`)),
              row('Accessories: rail', choiceRow(RAIL_LENGTHS, acc.rail)),
              row('Accessories: rail cover', choiceRow(RAIL_LENGTHS, acc.rail_cover)),
              row('Accessories: motor', choiceRow(MOTORS, acc.motor)),
              row('Accessories: controller', choiceRow(CONTROLLERS, acc.controller, !!acc.controller && !CONTROLLERS.includes(acc.controller))),
              row('Accessories: (others) :', `<span class="uline" style="min-width:330px">${fill(acc.others)}</span>`),
            ].join('')
          : ''
      }
    </table>
    <div class="box problems${hasAccessories ? '' : ' tall'}"><div class="lbl">Problems:</div>${problems}</div>
    <div class="box comment"><div class="lbl">Customer comment:</div><div class="fill">${esc(job.customer_comment)}</div></div>
    <div class="sigs">
      ${sig('Technical Manager / Supervisor', job.salesman_signature, job.salesman_name, job.salesman_signed_at)}
      ${sig('Technician Signature', job.technician_signature, techs, job.completed_at)}
      ${sig('Customer Chop &amp; Signature', job.customer_signature, job.customer_sign_name, job.customer_signature ? job.completed_at : null)}
    </div>
    ${
      photos.length
        ? `<div class="muted" style="margin-top:6px">Attached: ${photos.filter((ph) => ph.stage === 'before').length} before-service and ${photos.filter((ph) => ph.stage === 'after').length} after-service photo(s) on the following page(s).</div>`
        : ''
    }
    ${attachmentsHtml(job, photos)}
  </body></html>`;
}

// Downloads the job's photos (as data URIs) so they can be printed inside the PDF.
async function loadReportPhotos(job: JobDetail): Promise<ReportPhoto[]> {
  const out: ReportPhoto[] = [];
  for (const p of job.photos ?? []) {
    const { data_uri } = await api<{ data_uri: string }>(`/jobs/${job.id}/photos/${p.id}?base64=1`, { timeoutMs: 30000 });
    out.push({ data_uri, caption: p.caption, stage: p.stage });
  }
  return out;
}

export async function shareServiceReport(job: JobDetail) {
  console.log(`[report] ${job.job_no}: building PDF`);
  const html = reportHtml(job, await loadReportPhotos(job));
  const options = { html, base64: true, ...A4 };
  // Android occasionally fails the first render ("error occured while writing the PDF data").
  const printed = await Print.printToFileAsync(options).catch((e) => {
    console.warn(`[report] ${job.job_no}: first PDF attempt failed, retrying`, e?.message);
    return Print.printToFileAsync(options);
  });
  if (!printed.base64) throw new Error('PDF could not be created, please try again');
  // Expo Go can't read or share files in Print's own folder, so write the PDF bytes into the
  // app's cache under a readable name (also the file name the customer sees on WhatsApp).
  const pdf = new File(Paths.cache, `Service-Report-${job.job_no}.pdf`);
  pdf.create({ overwrite: true });
  pdf.write(printed.base64, { encoding: 'base64' });
  const uri = pdf.uri;
  console.log(`[report] ${job.job_no}: PDF saved at ${uri}`);
  const canShare = await Sharing.isAvailableAsync();
  console.log(`[report] ${job.job_no}: sharing available = ${canShare}`);
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Service report ${job.job_no}`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }
  console.log(`[report] ${job.job_no}: share sheet closed`);
}

// Opens the phone's print screen, where "Save as PDF" stores the report in Downloads.
// Works even where sharing a file to WhatsApp is blocked (Expo Go on Android).
export async function printServiceReport(job: JobDetail) {
  console.log(`[report] ${job.job_no}: opening print / save as PDF`);
  await Print.printAsync({ html: reportHtml(job, await loadReportPhotos(job)), ...A4 });
}

// The full report (with photos) for reviewing on screen before the salesman signs. Marked as a
// preview and scaled for a phone screen; not shareable – sharing stays locked until signed.
export async function previewReportHtml(job: JobDetail) {
  const html = reportHtml(job, await loadReportPhotos(job));
  const banner = job.salesman_signature
    ? ''
    : `<div style="position:sticky;top:0;z-index:9;background:#B45309;color:#fff;font:700 14px Arial;padding:8px 12px;margin:-22px -28px 12px">PREVIEW – not signed by salesman yet</div>`;
  return html
    .replace('<head>', '<head><meta name="viewport" content="width=650, user-scalable=yes"/>')
    .replace('<body>', `<body style="margin:22px 28px">${banner}`)
    .replace(/\.attach \{ page-break-before: always;/, '.attach { margin-top: 28px; border-top: 3px dashed #bbb; padding-top: 16px; page-break-before: always;');
}
