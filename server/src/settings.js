// Company-wide settings the admin can change in the app (More > Settings).
// Each setting has a fixed set of allowed values and a default.
export const SETTINGS = {
  // Can salesmen see the "Installed models" report? off | own (jobs they posted/sold) | all
  salesman_installed_report: { values: ['off', 'own', 'all'], default: 'off' },
  // Minutes without using the app before a phone must log in again: 30 min, 8 h, 7 days, 30 days.
  session_idle_minutes: { values: ['30', '480', '10080', '43200'], default: '30' },
};

export function idleLabel(minutes) {
  const m = Number(minutes);
  if (m < 60) return `${m} minutes`;
  if (m < 1440) return `${m / 60} hours`;
  return `${m / 1440} days`;
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    Object.entries(SETTINGS).map(([key, def]) => [key, def.values.includes(stored[key]) ? stored[key] : def.default])
  );
}

// Returns an error message for the first invalid key/value, or saves them all.
export function saveSettings(db, changes) {
  for (const [key, value] of Object.entries(changes || {})) {
    const def = SETTINGS[key];
    if (!def) return `Unknown setting: ${key}`;
    if (!def.values.includes(value)) return `${key} must be one of: ${def.values.join(', ')}`;
  }
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(changes || {})) upsert.run(key, value);
  return null;
}
