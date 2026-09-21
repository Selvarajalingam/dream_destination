import { helpRepository, NATIONAL_EMERGENCY_NUMBER, FACILITY_ORDER } from '@/modules/help/repository';
import { HelpActions } from './HelpActions';
import { formatDistance } from '@/shared/geo';
import { formatSourceDate } from '@/shared/time';

/**
 * Screen T18 — Nearby Help.
 *
 * Useful assistance in no more than two taps: the emergency number, a saved
 * contact and location sharing are the first three actions, before any list.
 * The facility list is server-rendered so the service worker can cache the
 * whole page and it still answers with no signal.
 */

export const dynamic = 'force-dynamic';

/** Pilot region centre, used until the traveller shares a location. */
const PILOT_CENTER = { lat: 11.0168, lng: 76.9558 };

const FACILITY_LABELS: Record<string, string> = {
  hospital: 'Hospitals',
  pharmacy: 'Pharmacies',
  police: 'Police',
  tourist_assistance: 'Tourist assistance',
  forest_office: 'Forest offices',
  fuel: 'Fuel',
  ev_charging: 'EV charging',
};

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const { lat, lng } = await searchParams;

  const point =
    lat === undefined || lng === undefined ? PILOT_CENTER : { lat: Number(lat), lng: Number(lng) };

  const facilities = await helpRepository.findNearby(point, 60_000, FACILITY_ORDER, 40);

  const grouped = new Map<string, typeof facilities>();
  for (const facility of facilities) {
    grouped.set(facility.facilityType, [...(grouped.get(facility.facilityType) ?? []), facility]);
  }

  return (
    <article>
      <h1 className="text-[26px] lg:text-[32px]">Nearby help</h1>

      {/* The three top actions, before anything else on the screen. */}
      <HelpActions emergencyNumber={NATIONAL_EMERGENCY_NUMBER} />

      <p className="mt-4 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-[14px]">
        These are facilities recorded in the pilot directory with the date each was checked.{' '}
        <span className="font-[650]">Live availability is unknown</span> — call before travelling to
        one where you can.
      </p>

      <div className="mt-5 space-y-6">
        {FACILITY_ORDER.map((type) => {
          const entries = grouped.get(type) ?? [];
          if (entries.length === 0) return null;

          return (
            <section key={type}>
              <h2 className="text-[21px]">{FACILITY_LABELS[type] ?? type}</h2>
              <ul className="mt-3 divide-y divide-border-subtle rounded-[16px] border border-border-subtle">
                {entries.slice(0, 6).map((facility) => (
                  <li key={facility.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-[650]">{facility.name}</p>
                      <p className="text-[14px] text-text-secondary">
                        {formatDistance(facility.distanceMeters)} away
                        {facility.verifiedAt !== null &&
                          ` · checked ${formatSourceDate(facility.verifiedAt)}`}
                      </p>
                      {facility.isStale && (
                        <p className="text-[14px] font-[650] text-status-warn">
                          Past its review date — confirm before relying on it
                        </p>
                      )}
                    </div>

                    {facility.phone !== null && (
                      <a
                        href={`tel:${facility.phone}`}
                        data-touch-target
                        className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
                      >
                        Call
                      </a>
                    )}
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${facility.lat}&mlon=${facility.lng}#map=16/${facility.lat}/${facility.lng}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      data-touch-target
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-3 text-[14px] font-[650]"
                    >
                      Open in maps
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </article>
  );
}
