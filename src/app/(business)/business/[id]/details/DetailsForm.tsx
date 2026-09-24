'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import { ApiProblemError, api } from '@/lib/api-client';
import { useHydrated } from '@/lib/use-hydrated';
import type { OwnerCopy } from '../../copy';

const PinPicker = dynamic(() => import('./PinPicker').then((module) => module.PinPicker), { ssr: false });

/**
 * Screen B02 — Business Details, with automatic saving.
 *
 * Each change is saved shortly after the owner stops typing. The server keeps
 * every valid field and names any it could not accept, so a slow rural
 * connection or one mistyped PIN never costs the owner the rest of the form.
 */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const DAY_LABEL: Record<string, Record<(typeof DAYS)[number], string>> = {
  'en-IN': { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
  'ta-IN': { mon: 'திங்கள்', tue: 'செவ்வாய்', wed: 'புதன்', thu: 'வியாழன்', fri: 'வெள்ளி', sat: 'சனி', sun: 'ஞாயிறு' },
};
const PAYMENT_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer' };
const PRICE_LABEL: Record<number, string> = { 1: '₹ Budget', 2: '₹₹ Moderate', 3: '₹₹₹ Higher', 4: '₹₹₹₹ Premium' };

export type DetailsInitial = {
  name: string;
  category: string | null;
  description: string | null;
  addressLine: string | null;
  locality: string | null;
  pin: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  ownerName: string | null;
  hours: Partial<Record<(typeof DAYS)[number], [string, string] | null>>;
  priceBand: number | null;
  services: string[];
  paymentMethods: string[];
  accessibility: { stepFreeEntry?: boolean | null; accessibleToilet?: boolean | null; note?: string | null };
};

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed' };

export function DetailsForm({
  businessId,
  initial,
  copy,
  locale,
  categories,
  categoryLabels,
  nextHref,
}: {
  businessId: string;
  initial: DetailsInitial;
  copy: OwnerCopy;
  locale: string;
  categories: readonly string[];
  categoryLabels: Record<string, string>;
  nextHref: string;
}) {
  const [values, setValues] = useState(() => ({
    name: initial.name,
    category: initial.category ?? '',
    description: initial.description ?? '',
    addressLine: initial.addressLine ?? '',
    locality: initial.locality ?? '',
    pin: initial.pin ?? '',
    lat: String(initial.lat),
    lng: String(initial.lng),
    phone: initial.phone ?? '',
    ownerName: initial.ownerName ?? '',
    hours: initial.hours,
    priceBand: initial.priceBand,
    services: initial.services.join(', '),
    paymentMethods: initial.paymentMethods,
    accessibility: {
      stepFreeEntry: initial.accessibility.stepFreeEntry ?? null,
      accessibleToilet: initial.accessibility.accessibleToilet ?? null,
      note: initial.accessibility.note ?? '',
    },
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const hydrated = useHydrated();

  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(values);
  latest.current = values;

  /** The API shape of one field, from the form's current values. */
  const apiValue = (field: string, v: typeof values): unknown => {
    switch (field) {
      case 'location':
        return { lat: Number(v.lat), lng: Number(v.lng) };
      case 'services':
        return v.services
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '');
      case 'accessibility':
        return v.accessibility;
      default:
        return v[field as keyof typeof v];
    }
  };

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const fields = [...dirty.current];
    if (fields.length === 0) return true;
    dirty.current.clear();

    const body: Record<string, unknown> = {};
    for (const field of fields) body[field] = apiValue(field, latest.current);

    setSaveState({ kind: 'saving' });
    try {
      const result = await api.patch<{ saved: string[]; errors: Record<string, string> }>(
        `/api/v1/business/listings/${businessId}`,
        body,
      );
      setErrors((previous) => {
        const next = { ...previous };
        for (const field of result.saved) delete next[field];
        return { ...next, ...result.errors };
      });
      const failed = Object.keys(result.errors).length > 0;
      setSaveState(failed ? { kind: 'failed' } : { kind: 'saved', at: new Date() });
      return !failed;
    } catch (caught) {
      // Put the fields back, so the next change retries them.
      for (const field of fields) dirty.current.add(field);
      setSaveState({ kind: 'failed' });
      if (caught instanceof ApiProblemError && caught.problem.status === 409) {
        setErrors((previous) => ({ ...previous, form: caught.problem.detail ?? caught.problem.title }));
      }
      return false;
    }
    // apiValue only reads its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const change = <K extends keyof typeof values>(key: K, value: (typeof values)[K], field: string = key) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    dirty.current.add(field);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };

  // Save anything pending if the owner leaves the page.
  useEffect(() => {
    const beforeUnload = () => {
      if (dirty.current.size > 0) void flush();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [flush]);

  const setDay = (day: (typeof DAYS)[number], slot: [string, string] | null) => {
    change('hours', { ...latest.current.hours, [day]: slot });
  };

  const fieldError = (field: string) =>
    errors[field] === undefined ? null : (
      <span id={`${field}-error`} className="mt-1 block text-[13px] font-[650] text-status-danger-text">
        {errors[field]}
      </span>
    );

  const input = 'mt-1 min-h-[44px] w-full rounded-xl border border-text-secondary/60 bg-surface-base px-3 text-[16px]';

  return (
    <div className="space-y-4">
      <p
        role="status"
        aria-live="polite"
        data-testid="save-state"
        data-state={saveState.kind}
        className="sticky top-0 z-10 rounded-xl bg-surface-subtle px-3 py-2 text-[14px] text-text-secondary"
      >
        {saveState.kind === 'saving' && copy.saving}
        {saveState.kind === 'saved' &&
          `${copy.savedAt} ${saveState.at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`}
        {saveState.kind === 'failed' && <span className="font-[650] text-status-danger-text">{copy.saveFailed}</span>}
        {saveState.kind === 'idle' && copy.progressSaved}
      </p>

      {errors.form !== undefined && (
        <p role="alert" className="text-[14px] font-[650] text-status-danger-text">
          {errors.form}
        </p>
      )}

      {/*
        Disabled until hydrated: on a slow connection, anything typed before
        the page is interactive would show but never be saved.
      */}
      <fieldset disabled={!hydrated} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <Card className="space-y-4 p-4">
          <h2 className="text-[18px] font-[650]">{copy.sectionBasics}</h2>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.businessName}</span>
            <input
              name="name"
              value={values.name}
              maxLength={80}
              onChange={(event) => change('name', event.target.value)}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name !== undefined ? 'name-error' : undefined}
              className={input}
            />
            {fieldError('name')}
          </label>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.category}</span>
            <select
              name="category"
              value={values.category}
              onChange={(event) => change('category', event.target.value)}
              className={input}
            >
              <option value="" disabled>
                {copy.chooseCategory}
              </option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category] ?? category}
                </option>
              ))}
            </select>
            {fieldError('category')}
          </label>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.description}</span>
            <textarea
              name="description"
              value={values.description}
              maxLength={400}
              rows={3}
              onChange={(event) => change('description', event.target.value)}
              aria-describedby="description-help"
              className="mt-1 block w-full rounded-xl border border-text-secondary/60 bg-surface-base p-3 text-[16px]"
            />
            <span id="description-help" className="mt-1 block text-[13px] text-text-secondary">
              {copy.descriptionHelp}
            </span>
            {fieldError('description')}
          </label>
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-[18px] font-[650]">{copy.sectionLocation}</h2>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.addressLine}</span>
            <input name="addressLine" value={values.addressLine} maxLength={160} onChange={(event) => change('addressLine', event.target.value)} className={input} />
            {fieldError('addressLine')}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[14px] font-[650]">{copy.locality}</span>
              <input name="locality" value={values.locality} maxLength={80} onChange={(event) => change('locality', event.target.value)} className={input} />
              {fieldError('locality')}
            </label>
            <label className="block">
              <span className="block text-[14px] font-[650]">{copy.pin}</span>
              <input
                name="pin"
                value={values.pin}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={7}
                onChange={(event) => change('pin', event.target.value)}
                aria-invalid={errors.pin !== undefined}
                aria-describedby={errors.pin !== undefined ? 'pin-error' : undefined}
                className={input}
              />
              {fieldError('pin')}
            </label>
          </div>

          <PinPicker
            lat={Number(values.lat)}
            lng={Number(values.lng)}
            label={copy.sectionLocation}
            onPick={(point) => {
              setValues((previous) => ({ ...previous, lat: String(point.lat), lng: String(point.lng) }));
              latest.current = { ...latest.current, lat: String(point.lat), lng: String(point.lng) };
              dirty.current.add('location');
              void flush();
            }}
          />
          <p id="location-help" className="text-[13px] text-text-secondary">
            {copy.locationHelp}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[14px] font-[650]">{copy.latitude}</span>
              <input name="lat" value={values.lat} inputMode="decimal" onChange={(event) => change('lat', event.target.value, 'location')} aria-describedby="location-help" className={input} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-[650]">{copy.longitude}</span>
              <input name="lng" value={values.lng} inputMode="decimal" onChange={(event) => change('lng', event.target.value, 'location')} aria-describedby="location-help" className={input} />
            </label>
          </div>
          {fieldError('location')}
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-[18px] font-[650]">{copy.sectionContact}</h2>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.phone}</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={(event) => change('phone', event.target.value)}
              aria-invalid={errors.phone !== undefined}
              aria-describedby={errors.phone !== undefined ? 'phone-error' : undefined}
              className={input}
            />
            {fieldError('phone')}
          </label>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.ownerName}</span>
            <input name="ownerName" autoComplete="name" value={values.ownerName} maxLength={80} onChange={(event) => change('ownerName', event.target.value)} className={input} />
            {fieldError('ownerName')}
          </label>
        </Card>

        <Card className="p-4">
          <h2 className="text-[18px] font-[650]">{copy.sectionHours}</h2>
          <HoursEditor hours={values.hours} dayLabels={DAY_LABEL[locale] ?? DAY_LABEL['en-IN']} copy={copy} onChange={setDay} />
          {fieldError('hours')}
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-[18px] font-[650]">{copy.sectionOffer}</h2>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.priceBand}</span>
            <select
              name="priceBand"
              value={values.priceBand ?? ''}
              onChange={(event) => change('priceBand', event.target.value === '' ? null : Number(event.target.value))}
              className={input}
            >
              <option value="">{copy.priceBandNone}</option>
              {[1, 2, 3, 4].map((band) => (
                <option key={band} value={band}>
                  {PRICE_LABEL[band]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.services}</span>
            <input name="services" value={values.services} onChange={(event) => change('services', event.target.value)} aria-describedby="services-help" className={input} />
            <span id="services-help" className="mt-1 block text-[13px] text-text-secondary">
              {copy.servicesHelp}
            </span>
            {fieldError('services')}
          </label>
          <fieldset>
            <legend className="text-[14px] font-[650]">{copy.payments}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(PAYMENT_LABEL).map(([method, label]) => (
                <label key={method} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border-subtle px-3 text-[14px]">
                  <input
                    type="checkbox"
                    checked={values.paymentMethods.includes(method)}
                    onChange={(event) =>
                      change(
                        'paymentMethods',
                        event.target.checked
                          ? [...latest.current.paymentMethods, method]
                          : latest.current.paymentMethods.filter((item) => item !== method),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-[18px] font-[650]">{copy.sectionAccess}</h2>
          <TriState
            legend={copy.stepFree}
            name="stepFreeEntry"
            value={values.accessibility.stepFreeEntry}
            copy={copy}
            onChange={(value) => change('accessibility', { ...latest.current.accessibility, stepFreeEntry: value })}
          />
          <TriState
            legend={copy.accessibleToilet}
            name="accessibleToilet"
            value={values.accessibility.accessibleToilet}
            copy={copy}
            onChange={(value) => change('accessibility', { ...latest.current.accessibility, accessibleToilet: value })}
          />
          <label className="block">
            <span className="block text-[14px] font-[650]">{copy.accessNote}</span>
            <input
              name="accessNote"
              value={values.accessibility.note}
              maxLength={200}
              onChange={(event) => change('accessibility', { ...latest.current.accessibility, note: event.target.value })}
              className={input}
            />
          </label>
          {fieldError('accessibility')}
        </Card>

        <Button
          onClick={() =>
            void (async () => {
              await flush();
              // A full navigation: the next step renders from what was just saved.
              window.location.assign(nextHref);
            })()
          }
        >
          {copy.continueToEvidence}
        </Button>
      </fieldset>
    </div>
  );
}

export function HoursEditor({
  hours,
  dayLabels,
  copy,
  onChange,
}: {
  hours: DetailsInitial['hours'];
  dayLabels: Record<(typeof DAYS)[number], string>;
  copy: OwnerCopy;
  onChange: (day: (typeof DAYS)[number], slot: [string, string] | null) => void;
}) {
  return (
    <ul className="mt-2 divide-y divide-border-subtle">
      {DAYS.map((day) => {
        const slot = hours[day] ?? null;
        return (
          <li key={day} className="flex flex-wrap items-center gap-3 py-2">
            <span className="w-28 text-[14px] font-[650]">{dayLabels[day]}</span>
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={slot === null}
                onChange={(event) => onChange(day, event.target.checked ? null : ['09:00', '18:00'])}
              />
              {copy.closed}
            </label>
            {slot !== null && (
              <>
                <label className="flex items-center gap-2 text-[14px]">
                  <span className="visually-hidden">
                    {dayLabels[day]} {copy.opens}
                  </span>
                  <span aria-hidden="true">{copy.opens}</span>
                  <input
                    type="time"
                    value={slot[0]}
                    onChange={(event) => onChange(day, [event.target.value, slot[1]])}
                    className="min-h-[44px] rounded-xl border border-text-secondary/60 bg-surface-base px-2 text-[16px]"
                  />
                </label>
                <label className="flex items-center gap-2 text-[14px]">
                  <span className="visually-hidden">
                    {dayLabels[day]} {copy.closes}
                  </span>
                  <span aria-hidden="true">{copy.closes}</span>
                  <input
                    type="time"
                    value={slot[1]}
                    onChange={(event) => onChange(day, [slot[0], event.target.value])}
                    className="min-h-[44px] rounded-xl border border-text-secondary/60 bg-surface-base px-2 text-[16px]"
                  />
                </label>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TriState({
  legend,
  name,
  value,
  copy,
  onChange,
}: {
  legend: string;
  name: string;
  value: boolean | null;
  copy: OwnerCopy;
  onChange: (value: boolean | null) => void;
}) {
  const options: Array<{ label: string; value: boolean | null }> = [
    { label: copy.yes, value: true },
    { label: copy.no, value: false },
    { label: copy.notSure, value: null },
  ];
  return (
    <fieldset>
      <legend className="text-[14px] font-[650]">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={String(option.value)} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border-subtle px-3 text-[14px]">
            <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
