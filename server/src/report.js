// Service report (matches the paper SERVICE REPORT form) – built on the server so the website,
// phones and laptops all get the identical PDF. Photos follow on BEFORE / AFTER SERVICE pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOGO_DATA_URI = `data:image/png;base64,${fs.readFileSync(path.join(HERE, '..', 'assets', 'company-logo.png')).toString('base64')}`;

export const COMPANY_NAME = 'EBCOTECH MACHINERY';
export const COMPANY = {
  chinese: '德科德機械有限公司',
  regNo: '(833774-U)',
  address: 'No 1, Jalan Gangsa SD5/3A, Bandar Sri Damansara, 52200 K.L., Malaysia.',
  phones: 'Tel. (6) 03-6280 6226, 03-6280 6228 &nbsp; Fax. (6) 03-6280 6222',
  helpline: 'Customer Service Helpline: (6) 03-6280 6221',
  web: 'www.gwgewalt.com',
};

// Option lists from the paper form (same as the app's job form).
export const PRODUCT_MODELS = ['HH150 EASY', 'HH150 PREMIUM', 'HH100', 'HH200B', 'HH350', 'HH400', 'HB220B', 'FW8900', 'SP8900', 'TELESCOPIC DOOR', 'MAGIC DOOR'];
const DOOR_VARIANTS = ['SINGLE', 'DOUBLE'];
const HOUSE_BRAND = 'GEWALT';
const OPEN_DEVICES = ['INFRARED SENSOR', 'MICROWAVE SENSOR', 'PUSH BUTTON & REC', 'WAVE BUTTON & REC', 'PHOTOCELL', 'REMOTE CONTROL'];
const RAIL_LENGTHS = ['4.1 METER', '4.2 METER', '6.1 METER', '6.3 METER'];
const MOTORS = ['100W CIRCLE', '75W SQUARE'];
const CONTROLLERS = ['PREMIUM (orange+green)', 'EASY (white / blue)'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const niceDate = (str) => {
  if (!str) return '-';
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

const box = (checked, label) => `<span class="opt"><span class="cb">${checked ? '&#10003;' : ''}</span>${label}</span>`;

// Row of tick boxes for a fixed list, plus OTHERS with the free text when the value isn't listed.
function choiceRow(options, value, withOthers = true) {
  const v = value?.trim() || '';
  const other = v && !options.includes(v) ? v : '';
  return options.map((o) => box(v === o, esc(o))).join('') + (withOthers ? box(!!other, `OTHERS <span class="fill line-in">${esc(other)}</span>`) : '');
}

const time = (stamp) => (stamp ? stamp.slice(11, 16) : '');

const PHOTOS_PER_PAGE = 4;
const PHOTO_GROUPS = [
  { stage: 'before', title: 'BEFORE SERVICE', label: 'Before', color: '#B45309' },
  { stage: 'after', title: 'AFTER SERVICE', label: 'After', color: '#15803D' },
  { stage: null, title: 'OTHER PHOTOS', label: 'Photo', color: '#444' },
];

// Attachments: Before-service photos, then After-service photos, 4 per A4 page with descriptions.
function attachmentsHtml(job, photos) {
  const pages = [];
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

// job = the job detail the API returns (technicians, extras, photos…); photos = [{data_uri, caption, stage}]
export function reportHtml(job, photos = []) {
  const acc = job.accessories ?? {};
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

  const row = (label, content) => `<tr><th>${label}</th><td>${content}</td></tr>`;
  const fill = (text) => `<span class="fill">${esc(text) || '&nbsp;'}</span>`;
  const sig = (title, img, name, date) => `
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

// On-screen version for reviewing before the salesman signs: marked as a preview, scaled for a
// phone, attachment pages separated by a dashed line instead of page breaks.
export function previewHtml(job, photos) {
  const banner = job.salesman_signature
    ? ''
    : `<div style="position:sticky;top:0;z-index:9;background:#B45309;color:#fff;font:700 14px Arial;padding:8px 12px;margin:-22px -28px 12px">PREVIEW – not signed by salesman yet</div>`;
  return reportHtml(job, photos)
    .replace('<head>', '<head><meta name="viewport" content="width=820, user-scalable=yes"/>')
    .replace('<body>', `<body style="margin:22px 28px">${banner}`)
    .replace(/\.attach \{ page-break-before: always;/, '.attach { margin-top: 28px; border-top: 3px dashed #bbb; padding-top: 16px; page-break-before: always;');
}

// A4 PDF of the report, rendered by a headless browser (same engine as Chrome).
// `options` adds to the PDF settings (e.g. page numbers in the footer).
export async function reportPdf(html, options = {}) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, ...options }));
  } finally {
    await browser.close();
  }
}
