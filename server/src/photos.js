// Job photos (before/after, evidence) – stored as files next to the database:
// <photosDir>/<jobId>/<random>.jpg, with one row per photo in job_photos.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_PHOTOS_PER_JOB = 20;
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  png: { ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
};

// Decodes a "data:image/jpeg;base64,..." upload. Returns { buffer, type } or an error message.
export function decodeImage(dataUri) {
  const m = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUri || ''));
  if (!m) return { error: 'Photo must be a JPEG or PNG image' };
  const type = TYPES[m[1] === 'jpg' ? 'jpeg' : m[1]];
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) return { error: 'Photo is empty' };
  if (buffer.length > MAX_BYTES) return { error: 'Photo is too large (max 8 MB)' };
  if (!type.magic.every((b, i) => buffer[i] === b)) return { error: 'Photo file is not a valid image' };
  return { buffer, type };
}

export function savePhotoFile(photosDir, jobId, buffer, type) {
  const dir = path.join(photosDir, String(jobId));
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${crypto.randomBytes(12).toString('hex')}.${type.ext}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return fileName;
}

export function photoPath(photosDir, jobId, fileName) {
  return path.join(photosDir, String(jobId), path.basename(fileName));
}

export function mimeFor(fileName) {
  return fileName.endsWith('.png') ? TYPES.png.mime : TYPES.jpeg.mime;
}

export function removePhotoFile(photosDir, jobId, fileName) {
  fs.rmSync(photoPath(photosDir, jobId, fileName), { force: true });
}
