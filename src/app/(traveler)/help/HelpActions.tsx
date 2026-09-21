'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { PermissionDeniedState } from '@/components/states/states';

/**
 * The three top actions from Screen T18: call the emergency number, call a
 * saved contact, and share the current location.
 *
 * Location is requested only when the traveller taps the button, never on load
 * (T01), and a denial falls back to manually choosing a place rather than
 * blocking the screen (§9.6).
 */

export function HelpActions({ emergencyNumber }: { emergencyNumber: string }) {
  const [shareState, setShareState] = useState<'idle' | 'locating' | 'ready' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const emergencyContact = readEmergencyContact();

  const share = (): void => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      setShareState('denied');
      return;
    }

    setShareState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setShareState('ready');
      },
      () => setShareState('denied'),
      { timeout: 8_000, maximumAge: 60_000 },
    );
  };

  const shareText =
    coords === null
      ? ''
      : `My current location: https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`;

  return (
    <section aria-label="Immediate help" className="mt-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <a
          href={`tel:${emergencyNumber}`}
          data-touch-target
          className="inline-flex min-h-[56px] items-center justify-center rounded-[16px] bg-status-danger px-4 text-[16px] font-[700] text-white"
        >
          Call {emergencyNumber}
        </a>

        {emergencyContact === null ? (
          <a
            href="/profile"
            data-touch-target
            className="inline-flex min-h-[56px] items-center justify-center rounded-[16px] border border-border-subtle px-4 text-[16px] font-[650]"
          >
            Add an emergency contact
          </a>
        ) : (
          <a
            href={`tel:${emergencyContact.phone}`}
            data-touch-target
            className="inline-flex min-h-[56px] items-center justify-center rounded-[16px] border border-border-subtle px-4 text-[16px] font-[650]"
          >
            Call {emergencyContact.name}
          </a>
        )}

        <Button
          variant="secondary"
          onClick={share}
          className="min-h-[56px] rounded-[16px] text-[16px]"
          disabled={shareState === 'locating'}
        >
          {shareState === 'locating' ? 'Finding you…' : 'Share my location'}
        </Button>
      </div>

      {shareState === 'ready' && coords !== null && (
        <div className="mt-3 rounded-xl border border-border-subtle p-3">
          <p className="text-[14px] font-[650]">Your location</p>
          <p className="mt-1 break-all text-[14px] text-text-secondary">{shareText}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="small"
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(shareText)}
            >
              Copy
            </Button>
            <a
              href={`sms:?body=${encodeURIComponent(shareText)}`}
              data-touch-target
              className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-3 text-[14px] font-[650]"
            >
              Send by message
            </a>
          </div>
          <p className="mt-2 text-[13px] text-text-secondary">
            This location is not stored by Dream Destination. It is only put on your clipboard or
            into a message you send.
          </p>
        </div>
      )}

      {shareState === 'denied' && (
        <div className="mt-3">
          <PermissionDeniedState
            permission="location"
            alternative="We cannot find you automatically. You can still call for help using the numbers above, and describe the nearest listed place by name."
          />
        </div>
      )}
    </section>
  );
}

type EmergencyContact = { name: string; phone: string };

/**
 * The emergency contact is a per-device convenience, kept in browser storage
 * rather than on the server. PRD Part II §5.2 classifies it as sensitive, and
 * §12.3 says to keep sensitive data minimal.
 */
function readEmergencyContact(): EmergencyContact | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem('dd.emergencyContact');
    return raw === null ? null : (JSON.parse(raw) as EmergencyContact);
  } catch {
    // Private mode, cleared storage, or blocked site data: fall back to the
    // "add a contact" path rather than failing the screen.
    return null;
  }
}
