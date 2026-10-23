# Ebcotech Autodoor – Job & Technician App

A mobile-friendly website (works like an app on Android phones, with a full office layout on PCs):

- `server/` – the central database + API (Node.js, SQLite file in `server/data/autodoor.db`), the service report PDF (headless Chrome), Excel exports, and it serves the website.
- `web/` – the website (Next.js + Tailwind, built as static files into `web/out`). Phones: same screens as the old phone app, bottom tabs. PCs (wider than 1024 px): left menu, dashboard, jobs table with filters and side panel, incentive table, Excel downloads.
- `mobile/` – the earlier Expo phone app, kept for reference; no longer needed.

## Run it (testing on the office Wi-Fi)

1. Build the website once (again after changing it):
   ```
   cd web
   npm run build
   ```
2. Start the server (keep this window open):
   ```
   cd server
   npm start
   ```
   It prints the address, e.g. `http://192.168.110.236:4000`. Open it in Chrome on any phone/PC on the same Wi-Fi
   (on this laptop: http://localhost:4000). On Android, Chrome menu → **Add to Home screen** gives an app icon.
   If phones can't connect, allow Node.js / port 4000 through Windows Firewall.

While changing the website, `npm run dev` in `web/` gives a live preview at http://localhost:3000 (talks to the server on port 4000).

## Starter logins (change these passwords under More > Staff)

| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Salesman | sales1 | sales123 |
| Technician (senior) | tech1 | tech123 |
| Technician (junior) | tech2 | tech123 |

## How it works

- **Job posting** – salesman/admin posts a job (type, customer, site, date/time) and assigns technicians.
- **Technician** – sees own schedule, taps Start, then **Submit job report** (work done, working time, technician signature, customer chop & signature – each signature is saved the moment it is signed), or **KIV** with reason & follow-up date.
- **Salesman / admin** – checks the report, **signs it** (required), then **Mark job as done**. The PDF can only be shared after the salesman signs.
- **Automation** – when marked done, the finish time (when the technician submitted) and **warranty end date** (from job type's warranty months, overridable per job) are recorded automatically.
- **Service contracts** – a servicing job is auto-created 14 days before each due date (checked when the server starts and whenever someone opens Today – no timer, so the host may sleep when unused); completing it moves the contract to the next due date.
- **Reminders** – Today screen shows overdue / today / tomorrow / KIV / unassigned / contract services due / warranties ending; the phone schedules local notifications (8am summary, 1 hour before each timed job, 6pm "tomorrow" preview).
- **Service report PDF** – matches the paper SERVICE REPORT (EBCOTECH Machinery header, model / door / brand / job type ticks, INV/DO No., problems & work done, three signatures). Share via WhatsApp / email or Print / Save as PDF.
- **Search** – Jobs tab finds any job by INV/DO No. (case, spaces and dashes ignored), customer, job no. or address.
- **Photos** – two steps on each job: **① Before service** (on arrival, before touching anything) and **② After service** (work finished). Every photo needs a description. Camera or gallery, shrunk on the phone before upload. The PDF prints them on separate BEFORE SERVICE and AFTER SERVICE attachment pages, 4 per page.
- **Login expiry** – a phone must log in again after 30 minutes without using the app (only counts while the app is closed or in the background). Admin can change this in More → Settings and can log a person out of all phones (More → Staff).
- **Staff accounts** – admin creates accounts with a **temporary password**; each person must choose their own at first login (More → Change my password any time). Admin resets also give a temporary password. The last active admin can't be switched off or demoted.
- **Someone leaving** – More → Staff → the person: **Open jobs → Move all to…** hands their unfinished jobs to someone else in one step (reports a technician already submitted stay theirs), then switch **Active** off. All their past jobs, reports, photos and incentive stay.
- **Installed models** – Incentive tab → Installed models: count of systems installed per model and single/double door for any period. Admin can let salesmen see it (More → Settings).
- **Incentive** – per technician on each completed job:
  `base rate for job type (senior or junior)` + `extra situations x qty (welding, after-hours, outstation…, senior/junior amounts)` + `admin adjustments with reason` (for one-off special cases, can be negative).
  Technician grade is frozen at completion, so promotions don't change past incentive. Rates are edited under More > Job types & incentive rates.
  - **Under warranty** jobs pay no incentive. When posting a job, the app checks for earlier jobs at the same customer/address still in warranty and switches this on automatically. Staff can switch it off.
  - **Job limit**: a job type (or one job) can have a maximum total. If the technicians' rates add up to more than that, for example heavy glass needing 3–5 people, the limit is shared equally. Welding is paid per person on top.
  - Inspection is done by the salesman, so its rate is RM0.

## Tests

```
cd server
npm test
```

## Going live (daily use)

Live setup: server on **AWS Lightsail (Singapore)** at **https://app.gwgewalt.com**; Android staff install from a download link, iPhone staff through **TestFlight**.

### What you (the owner) need to do – accounts and payments
(Staff phones are all Android and the system is a website, so **no Expo or Apple account is needed**.)
1. **AWS Lightsail** (lightsail.aws.amazon.com): create an AWS account, then **Create instance**:
   - Region **Singapore**, platform **Linux/Unix**, blueprint **OS only → Ubuntu 24.04 LTS**, plan with **2 GB RAM** (about USD 12/month).
   - After it starts: **Networking → Create static IP** and attach it; in the instance's **Networking → IPv4 firewall** add **HTTPS (443)** (HTTP 80 and SSH 22 are open by default).
   - **Snapshots → Enable automatic snapshots** (daily copy of the whole server).
   - Download the **SSH key** (Account → SSH keys → default key for Singapore) and save it as `deploy/keys/lightsail.pem`.
2. **Web address**: ask whoever manages **gwgewalt.com** to add a DNS record: type **A**, name **app**, value = the Lightsail static IP.
3. Tell Claude the **static IP**, and share logins only when a step needs them – never paste passwords into chat.

### What Claude does (with your OK at each step)
4. Clear the test jobs: `cd server && node scripts/clear-test-jobs.js --yes` (makes a backup first; keeps staff, rates and settings).
5. Put `SERVER_IP` in `deploy/config.sh`, then set up the server and upload the app + database: `bash deploy/first-time.sh`.
6. Check `https://app.gwgewalt.com/api/health` from a phone on mobile data.
7. Send staff the link **https://app.gwgewalt.com** – on Android: open in Chrome → menu → **Add to Home screen**.

### Before staff start
8. As admin: add every staff member with their own login (More → Staff), set grades, make `sales1`, `tech1`, `tech2` inactive, change the admin password.
9. Run the app alongside paper for 1–2 weeks and compare incentive totals at month end.

### Updating after going live
- Any change (server or screens): `bash deploy/deploy.sh` – runs the tests, backs up the live database, builds and uploads the website and server, restarts. Staff see the new version next time the page loads.
- Extra copy of the data on the laptop: `bash deploy/download-backup.sh`.
- The server also keeps 30 days of daily database backups in `/opt/ebcotech/backups`; job photos (in `/opt/ebcotech/data/photos`) are covered by Lightsail's daily snapshots and by `download-backup.sh`.
