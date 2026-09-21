import Link from 'next/link';

/**
 * The page shown when a navigation cannot be served and nothing is cached for
 * it. It is precached by the service worker, so it is always available.
 *
 * It points at what still works rather than only stating what failed, which
 * is what PRD Part I §9.4 asks of the offline state.
 */
export default function OfflinePage() {
  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">You are offline</h1>
      <p className="mt-2 text-[16px] text-text-secondary">
        This page needs a connection. Anything you saved for offline is still on this device.
      </p>

      <ul className="mt-5 space-y-2">
        <li>
          <Link
            href="/help"
            data-touch-target
            className="flex min-h-[52px] items-center rounded-[16px] border border-border-subtle px-4 text-[16px] font-[650]"
          >
            Nearby help — emergency numbers and facilities
          </Link>
        </li>
        <li>
          <Link
            href="/trips"
            data-touch-target
            className="flex min-h-[52px] items-center rounded-[16px] border border-border-subtle px-4 text-[16px] font-[650]"
          >
            Your trips — open a saved plan
          </Link>
        </li>
      </ul>

      <p className="mt-5 text-[14px] text-text-secondary">
        Crowd and weather information needs a connection, so it is not shown while you are offline
        rather than being shown out of date.
      </p>
    </div>
  );
}
