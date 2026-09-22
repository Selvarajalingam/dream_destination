/**
 * Owner uploads — PRD Part I B02 photos and B03 evidence.
 *
 * B03: "Explain accepted files, privacy, and review time. Reject unsupported
 * or unsafe files before upload completes."
 *
 * The declared type and the file name are both chosen by the uploader, so
 * neither is trusted. The type is read from the file's first bytes, and a PDF
 * that can run script or carry other files is refused outright.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 6;
export const MAX_EVIDENCE_FILES = 6;

export type UploadPurpose = 'photo' | 'evidence';

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const ACCEPTED_TYPES: Record<UploadPurpose, readonly SniffedType[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  evidence: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

/** What the file input advertises, so the browser can filter before sending. */
export const ACCEPT_ATTRIBUTE: Record<UploadPurpose, string> = {
  photo: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  evidence: '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf',
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/** The type a file actually is, judged by its leading bytes. */
export function sniffType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/**
 * PDF features that let a document act rather than display. Evidence is read
 * by reviewers, so a file that can run script or launch something is refused
 * instead of being opened on a reviewer's machine.
 */
const UNSAFE_PDF_MARKERS = ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA'];

export function unsafePdfMarker(bytes: Uint8Array): string | null {
  // Latin-1 keeps every byte as one character, so binary streams cannot
  // shift the positions of the ASCII markers being looked for.
  let text = '';
  for (let index = 0; index < bytes.length; index += 65_536) {
    text += String.fromCharCode(...bytes.subarray(index, index + 65_536));
  }
  for (const marker of UNSAFE_PDF_MARKERS) {
    // A name ends at whitespace or a delimiter; /JS must not match /JSON.
    const pattern = new RegExp(`${marker.replace('/', '\\/')}(?![A-Za-z0-9])`);
    if (pattern.test(text)) return marker;
  }
  return null;
}

export type UploadCheck =
  | { ok: true; contentType: SniffedType }
  | { ok: false; reason: string };

/** Checks a whole file. Sizes are checked before the bytes are read, too. */
export function checkUpload(input: {
  purpose: UploadPurpose;
  size: number;
  bytes: Uint8Array;
  alreadyStored: number;
}): UploadCheck {
  const limit = input.purpose === 'photo' ? MAX_PHOTOS : MAX_EVIDENCE_FILES;
  if (input.alreadyStored >= limit) {
    return { ok: false, reason: `A listing can hold at most ${limit} ${input.purpose === 'photo' ? 'photos' : 'evidence files'}. Remove one first.` };
  }

  const sizeProblem = checkSize(input.size);
  if (sizeProblem !== null) return { ok: false, reason: sizeProblem };

  const type = sniffType(input.bytes);
  if (type === null || !ACCEPTED_TYPES[input.purpose].includes(type)) {
    return {
      ok: false,
      reason:
        input.purpose === 'photo'
          ? 'Photos must be JPEG, PNG or WebP images.'
          : 'Evidence must be a PDF or a JPEG, PNG or WebP image.',
    };
  }

  if (type === 'application/pdf') {
    const marker = unsafePdfMarker(input.bytes);
    if (marker !== null) {
      return {
        ok: false,
        reason: 'This PDF contains active content, such as scripts or attached files, so it cannot be accepted. Print it to a new PDF or upload a photo of the document instead.',
      };
    }
  }

  return { ok: true, contentType: type };
}

export function checkSize(size: number): string | null {
  if (size <= 0) return 'The file is empty.';
  if (size > MAX_UPLOAD_BYTES) return 'Files can be at most 5 MB. Try a smaller photo or a scan at lower resolution.';
  return null;
}

/** A display name with no path and nothing that could be read as markup. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned === '' ? 'file' : cleaned).slice(0, 120);
}
