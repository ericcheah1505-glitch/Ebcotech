import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// A login stays valid while it is used; after idleMinutes() without using the app the phone must
// log in again (protects data on lost or handed-over phones). The app pings while it is on screen,
// so this only counts time when the app is closed or in the background.
export function authMiddleware(db, { idleMinutes, idleLabel }) {
  const find = db.prepare(`
    SELECT u.id, u.name, u.username, u.role, u.grade, u.must_change_password,
           (julianday('now', 'localtime') - julianday(COALESCE(s.last_used_at, s.created_at))) * 1440 AS idle_minutes
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND u.active = 1
  `);
  const expire = db.prepare('DELETE FROM sessions WHERE token = ?');
  const touch = db.prepare("UPDATE sessions SET last_used_at = datetime('now', 'localtime') WHERE token = ?");
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const row = token && find.get(token);
    if (!row) return res.status(401).json({ error: 'Please log in again' });
    const limit = idleMinutes();
    if (row.idle_minutes > limit) {
      expire.run(token);
      return res.status(401).json({ error: `You were logged out after ${idleLabel(limit)} without using the app. Please log in again.` });
    }
    if (row.idle_minutes > 0.5) touch.run(token); // at most about once a minute
    const { idle_minutes, ...user } = row;
    req.user = user;
    req.token = token;
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for your role' });
    next();
  };
}
