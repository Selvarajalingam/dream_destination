'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { ApiProblemError, api } from '@/lib/api-client';

/**
 * Upload for B02 photos and B03 evidence.
 *
 * B03: "Reject unsupported or unsafe files before upload completes." The
 * browser refuses the wrong type or size before sending a byte; the server
 * then reads the real type from the file itself and refuses active PDFs, so
 * the browser check is a convenience and never the control.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<'photo' | 'evidence', string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  evidence: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

type StoredFile = { id: string; originalName: string; contentType: string };

export function FileUploader({
  businessId,
  purpose,
  evidenceKind,
  label,
  accept,
  files,
  editable,
  labels,
}: {
  businessId: string;
  purpose: 'photo' | 'evidence';
  evidenceKind?: string;
  label: string;
  accept: string;
  files: StoredFile[];
  editable: boolean;
  labels: { upload: string; uploading: string; remove: string; uploaded: string; accepted: string };
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Kept here from the API's answers, so the list never waits on a refresh.
  const [list, setList] = useState<StoredFile[]>(files);

  const upload = async (file: File): Promise<void> => {
    setError(null);
    setNotice(null);

    if (!TYPES[purpose].includes(file.type)) {
      setError(labels.accepted);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Files can be at most 5 MB. Try a smaller photo or a scan at lower resolution.');
      return;
    }

    const form = new FormData();
    form.set('file', file);
    form.set('purpose', purpose);
    if (evidenceKind !== undefined) form.set('evidenceKind', evidenceKind);

    setBusy(true);
    try {
      const { file: stored } = await api.upload<{ file: StoredFile }>(`/api/v1/business/listings/${businessId}/files`, form);
      setList((previous) => [...previous, stored]);
      setNotice(`${labels.uploaded}: ${stored.originalName}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'The upload failed. Try again.');
    } finally {
      setBusy(false);
      if (input.current !== null) input.current.value = '';
    }
  };

  const remove = async (fileId: string): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await api.delete(`/api/v1/business/listings/${businessId}/files/${fileId}`);
      setList((previous) => previous.filter((file) => file.id !== fileId));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'Could not remove the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`uploader-${evidenceKind ?? purpose}`}>
      <label htmlFor={inputId} className="block text-[14px] font-[650]">
        {label}
      </label>

      {list.length > 0 && (
        <ul className="mt-2 space-y-1">
          {list.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-subtle px-3 py-2 text-[14px]">
              <a href={`/api/v1/business/files/${file.id}`} className="min-w-0 break-all font-[650] text-brand-primary underline underline-offset-2">
                {file.originalName}
              </a>
              {editable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(file.id)}
                  className="min-h-[44px] rounded-lg px-3 font-[650] text-status-danger-text hover:bg-status-danger-surface"
                >
                  {labels.remove}
                  <span className="visually-hidden"> {file.originalName}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void upload(file);
          }}
          className="mt-2 block w-full text-[14px] file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-brand-primary file:px-4 file:font-[650] file:text-white"
        />
      )}

      <p role="status" aria-live="polite" className="mt-1 text-[13px] text-text-secondary">
        {busy ? labels.uploading : notice}
      </p>
      {error !== null && (
        <p role="alert" className="mt-1 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
