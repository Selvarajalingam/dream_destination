import { describe, expect, it } from 'vitest';
import { MAX_PHOTOS, MAX_UPLOAD_BYTES, checkUpload, safeFileName, sniffType, unsafePdfMarker } from '@/modules/businesses/domain/files';

const bytes = (...parts: Array<number[] | string>): Uint8Array =>
  new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'rest of image');
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 'jfif');
const WEBP = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ');
const PDF = bytes('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');

describe('sniffType', () => {
  it('recognises each accepted format from its leading bytes', () => {
    expect(sniffType(PNG)).toBe('image/png');
    expect(sniffType(JPEG)).toBe('image/jpeg');
    expect(sniffType(WEBP)).toBe('image/webp');
    expect(sniffType(PDF)).toBe('application/pdf');
  });

  it('recognises nothing else, whatever the file is called', () => {
    expect(sniffType(bytes('MZ\u0090\u0000'))).toBeNull(); // Windows executable
    expect(sniffType(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(sniffType(bytes('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffType(bytes('PK\u0003\u0004'))).toBeNull(); // zip, docx
  });
});

describe('unsafePdfMarker', () => {
  it('finds script, launch actions and embedded files', () => {
    expect(unsafePdfMarker(bytes('%PDF-1.7 << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>'))).toBe('/JavaScript');
    expect(unsafePdfMarker(bytes('%PDF-1.4 << /S /Launch /F (cmd.exe) >>'))).toBe('/Launch');
    expect(unsafePdfMarker(bytes('%PDF-1.4 << /Type /EmbeddedFile >>'))).toBe('/EmbeddedFile');
  });

  it('does not mistake a longer name for a dangerous one', () => {
    expect(unsafePdfMarker(bytes('%PDF-1.4 << /JSON (x) /JSX 1 >>'))).toBeNull();
    expect(unsafePdfMarker(PDF)).toBeNull();
  });
});

describe('checkUpload', () => {
  const base = { size: 1000, alreadyStored: 0 };

  it('accepts images for photos and PDFs only for evidence', () => {
    expect(checkUpload({ ...base, purpose: 'photo', bytes: PNG })).toEqual({ ok: true, contentType: 'image/png' });
    expect(checkUpload({ ...base, purpose: 'photo', bytes: PDF }).ok).toBe(false);
    expect(checkUpload({ ...base, purpose: 'evidence', bytes: PDF })).toEqual({ ok: true, contentType: 'application/pdf' });
  });

  it('refuses a PDF with active content, saying what to do instead', () => {
    const result = checkUpload({ ...base, purpose: 'evidence', bytes: bytes('%PDF-1.7 /JavaScript') });
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/Print it to a new PDF/) });
  });

  it('refuses empty and oversized files', () => {
    expect(checkUpload({ ...base, size: 0, purpose: 'photo', bytes: PNG }).ok).toBe(false);
    expect(checkUpload({ ...base, size: MAX_UPLOAD_BYTES + 1, purpose: 'photo', bytes: PNG })).toEqual({
      ok: false,
      reason: expect.stringMatching(/5 MB/),
    });
  });

  it('refuses a file past the per-listing limit', () => {
    expect(checkUpload({ ...base, alreadyStored: MAX_PHOTOS, purpose: 'photo', bytes: PNG })).toEqual({
      ok: false,
      reason: expect.stringMatching(/at most 6 photos/),
    });
  });
});

describe('safeFileName', () => {
  it('drops any path and characters that could be read as markup', () => {
    expect(safeFileName('C:\\Users\\me\\..\\licence.pdf')).toBe('licence.pdf');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('<img src=x onerror=alert(1)>.png')).toBe('_img src_x onerror_alert(1)_.png');
    expect(safeFileName('')).toBe('file');
  });
});
