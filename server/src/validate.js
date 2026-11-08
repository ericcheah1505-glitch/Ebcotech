// Signatures are drawn on the phone and sent as PNG images ("data:image/png;base64,..."). Anything else is
// refused: the text ends up inside the service report page, so it must never be able to carry code.
const SIGNATURE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_CHARS = 1_500_000;

export const isSignatureImage = (v) => typeof v === 'string' && v.length <= MAX_SIGNATURE_CHARS && SIGNATURE.test(v);

// For a request that may carry signatures: each one that is present (not empty) must be a real image.
// Returns an error message, or null when all is fine.
export function signatureError(body, keys) {
  for (const key of keys) {
    const v = body?.[key];
    if (v == null || v === '') continue;
    if (!isSignatureImage(v)) return 'A signature must be a PNG or JPEG image. Please sign again.';
  }
  return null;
}
