'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import { ApiProblemError, api } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import type { OwnerCopy } from '../../copy';
import { DAY_LABEL, HoursEditor, type DetailsInitial } from '../details/DetailsForm';

/**
 * Screen B06 — Business Updates.
 *
 * Four separate forms, each saying what happens when it is sent: rapid
 * details apply at once, a closure or availability note shows straight away,
 * and a sensitive change waits for a reviewer.
 */

const input = 'mt-1 min-h-[44px] w-full rounded-xl border border-text-secondary/60 bg-surface-base px-3 text-[16px]';
const PRICE_LABEL: Record<number, string> = { 1: '₹ Budget', 2: '₹₹ Moderate', 3: '₹₹₹ Higher', 4: '₹₹₹₹ Premium' };

type Current = DetailsInitial & {
  temporaryClosure: { from: string; until: string; note: string | null } | null;
  availabilityNote: string | null;
  hasPendingChange: boolean;
};

function useSubmit() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const outcome: ReactNode = (
    <>
      <p role="status" aria-live="polite" className="mt-2 text-[14px] font-[650] text-status-good-text">
        {message ?? ''}
      </p>
      {error !== null && (
        <p role="alert" className="mt-2 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </>
  );

  // Inert until the page can act, so an early press is never a lost native submit.
  return { busy: busy || !hydrated, submit, outcome };
}

export function UpdatesForms({ businessId, current, copy, locale }: { businessId: string; current: Current; copy: OwnerCopy; locale: string }) {
  return (
    <div className="space-y-4">
      <RapidForm businessId={businessId} current={current} copy={copy} locale={locale} />
      <ClosureForm businessId={businessId} current={current} copy={copy} />
      <AvailabilityForm businessId={businessId} current={current} copy={copy} />
      <SensitiveForm businessId={businessId} current={current} copy={copy} />
    </div>
  );
}

function RapidForm({ businessId, current, copy, locale }: { businessId: string; current: Current; copy: OwnerCopy; locale: string }) {
  const { busy, submit, outcome } = useSubmit();
  const [hours, setHours] = useState(current.hours);
  const [priceBand, setPriceBand] = useState<number | null>(current.priceBand);
  const [phone, setPhone] = useState(current.phone ?? '');
  const [services, setServices] = useState(current.services.join(', '));

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const fields: Record<string, unknown> = {};
    if (JSON.stringify(hours) !== JSON.stringify(current.hours)) fields.hours = hours;
    if (priceBand !== current.priceBand) fields.priceBand = priceBand;
    if (phone !== (current.phone ?? '')) fields.phone = phone;
    const serviceList = services.split(',').map((item) => item.trim()).filter((item) => item !== '');
    if (serviceList.join('|') !== current.services.join('|')) fields.services = serviceList;
    if (Object.keys(fields).length === 0) return;

    void submit(
      () => api.post(`/api/v1/business/listings/${businessId}/updates`, { fields }, { 'idempotency-key': `update-${Date.now()}` }),
      copy.changesSaved,
    );
  };

  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} aria-labelledby="rapid-heading">
        <h2 id="rapid-heading" className="text-[18px] font-[650]">
          {copy.rapidTitle}
        </h2>
        <HoursEditor
          hours={hours}
          dayLabels={DAY_LABEL[locale] ?? DAY_LABEL['en-IN']}
          copy={copy}
          onChange={(day, slot) => setHours((previous) => ({ ...previous, [day]: slot }))}
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.priceBand}</span>
            <select value={priceBand ?? ''} onChange={(event) => setPriceBand(event.target.value === '' ? null : Number(event.target.value))} className={input}>
              <option value="">{copy.priceBandNone}</option>
              {[1, 2, 3, 4].map((band) => (
                <option key={band} value={band}>
                  {PRICE_LABEL[band]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.phone}</span>
            <input name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={input} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="block text-[14px] font-[650]">{copy.services}</span>
          <input value={services} onChange={(event) => setServices(event.target.value)} className={input} />
        </label>
        <Button type="submit" className="mt-3" disabled={busy}>
          {copy.saveChanges}
        </Button>
        {outcome}
      </form>
    </Card>
  );
}

function ClosureForm({ businessId, current, copy }: { businessId: string; current: Current; copy: OwnerCopy }) {
  const { busy, submit, outcome } = useSubmit();
  const [from, setFrom] = useState(current.temporaryClosure?.from ?? '');
  const [until, setUntil] = useState(current.temporaryClosure?.until ?? '');
  const [note, setNote] = useState(current.temporaryClosure?.note ?? '');

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void submit(
      () => api.put(`/api/v1/business/listings/${businessId}/closure`, { closure: { from, until, note: note.trim() === '' ? null : note.trim() } }),
      copy.changesSaved,
    );
  };

  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} aria-labelledby="closure-heading">
        <h2 id="closure-heading" className="text-[18px] font-[650]">
          {copy.closureTitle}
        </h2>
        <p className="mt-1 text-[14px] text-text-secondary">{copy.closureLead}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.closedFrom}</span>
            <input type="date" name="closedFrom" required value={from} onChange={(event) => setFrom(event.target.value)} className={input} />
          </label>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.reopens}</span>
            <input type="date" name="closedUntil" required value={until} onChange={(event) => setUntil(event.target.value)} className={input} />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="block text-[14px] font-[650]">{copy.closureNote}</span>
          <input maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} className={input} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {copy.setClosure}
          </Button>
          {current.temporaryClosure !== null && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void submit(() => api.put(`/api/v1/business/listings/${businessId}/closure`, { closure: null }), copy.changesSaved)}
            >
              {copy.clearClosure}
            </Button>
          )}
        </div>
        {outcome}
      </form>
    </Card>
  );
}

function AvailabilityForm({ businessId, current, copy }: { businessId: string; current: Current; copy: OwnerCopy }) {
  const { busy, submit, outcome } = useSubmit();
  const [note, setNote] = useState(current.availabilityNote ?? '');

  return (
    <Card className="p-4">
      <form
        aria-labelledby="availability-heading"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(() => api.put(`/api/v1/business/listings/${businessId}/availability`, { note }), copy.changesSaved);
        }}
      >
        <h2 id="availability-heading" className="text-[18px] font-[650]">
          {copy.availabilityTitle}
        </h2>
        <label className="mt-2 block">
          <span className="block text-[14px] text-text-secondary">{copy.availabilityLead}</span>
          <input name="availability" maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} className={input} />
        </label>
        <Button type="submit" className="mt-3" disabled={busy}>
          {copy.saveAvailability}
        </Button>
        {outcome}
      </form>
    </Card>
  );
}

function SensitiveForm({ businessId, current, copy }: { businessId: string; current: Current; copy: OwnerCopy }) {
  const { busy, submit, outcome } = useSubmit();
  const [values, setValues] = useState({
    name: current.name,
    addressLine: current.addressLine ?? '',
    locality: current.locality ?? '',
    pin: current.pin ?? '',
    lat: String(current.lat),
    lng: String(current.lng),
    ownerName: current.ownerName ?? '',
  });
  const [note, setNote] = useState('');

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((previous) => ({ ...previous, [key]: event.target.value }));

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const fields: Record<string, unknown> = {};
    if (values.name !== current.name) fields.name = values.name;
    if (values.addressLine !== (current.addressLine ?? '')) fields.addressLine = values.addressLine;
    if (values.locality !== (current.locality ?? '')) fields.locality = values.locality;
    if (values.pin !== (current.pin ?? '')) fields.pin = values.pin;
    if (values.ownerName !== (current.ownerName ?? '')) fields.ownerName = values.ownerName;
    if (Number(values.lat) !== current.lat || Number(values.lng) !== current.lng) {
      fields.location = { lat: Number(values.lat), lng: Number(values.lng) };
    }
    if (Object.keys(fields).length === 0) return;

    void submit(
      () =>
        api.post(`/api/v1/business/listings/${businessId}/updates`, { fields, note }, { 'idempotency-key': `change-${Date.now()}` }),
      copy.changeRequested,
    );
  };

  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} aria-labelledby="sensitive-heading" data-testid="sensitive-form">
        <h2 id="sensitive-heading" className="text-[18px] font-[650]">
          {copy.sensitiveTitle}
        </h2>
        <p className="mt-1 text-[14px] text-text-secondary">{copy.sensitiveLead}</p>

        {current.hasPendingChange ? (
          <p className="mt-3 rounded-xl bg-surface-subtle p-3 text-[14px] font-[650]">{copy.changePending}</p>
        ) : (
          <>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[14px] font-[650]">{copy.businessName}</span>
                <input name="sensitiveName" value={values.name} onChange={set('name')} className={input} />
              </label>
              <label className="block">
                <span className="block text-[14px] font-[650]">{copy.ownerName}</span>
                <input name="sensitiveOwner" value={values.ownerName} onChange={set('ownerName')} className={input} />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[14px] font-[650]">{copy.addressLine}</span>
                <input name="sensitiveAddress" value={values.addressLine} onChange={set('addressLine')} className={input} />
              </label>
              <label className="block">
                <span className="block text-[14px] font-[650]">{copy.locality}</span>
                <input value={values.locality} onChange={set('locality')} className={input} />
              </label>
              <label className="block">
                <span className="block text-[14px] font-[650]">{copy.pin}</span>
                <input inputMode="numeric" value={values.pin} onChange={set('pin')} className={input} />
              </label>
              <label className="block">
                <span className="block text-[14px] font-[650]">{copy.latitude}</span>
                <input inputMode="decimal" value={values.lat} onChange={set('lat')} className={input} />
              </label>
              <label className="block">
                <span className="block text-[14px] font-[650]">{copy.longitude}</span>
                <input inputMode="decimal" value={values.lng} onChange={set('lng')} className={input} />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="block text-[14px] font-[650]">{copy.changeReason}</span>
              <textarea
                name="changeReason"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={500}
                className="mt-1 block w-full rounded-xl border border-text-secondary/60 bg-surface-base p-3 text-[16px]"
              />
            </label>
            <Button type="submit" variant="secondary" className="mt-3" disabled={busy}>
              {copy.requestChange}
            </Button>
          </>
        )}
        {outcome}
      </form>
    </Card>
  );
}
