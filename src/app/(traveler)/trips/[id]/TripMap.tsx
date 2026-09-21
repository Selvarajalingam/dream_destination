'use client';

import { useEffect, useRef } from 'react';

/**
 * Leaflet map with OpenStreetMap tiles.
 *
 * Loaded client-side only. PRD Part I §11 requires map pins to have a
 * list-view equivalent, so the same places are rendered as a real list beside
 * the canvas rather than being reachable only by pointer.
 *
 * Leaflet is imported dynamically so it never enters the server bundle.
 */

export type MapPlace = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
};

export function TripMap({ places }: { places: MapPlace[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const leaflet = await import('leaflet');
      if (cancelled || containerRef.current === null) return;

      // Guard against a double-init during React strict mode's remount.
      if (mapRef.current !== null) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = leaflet.map(containerRef.current, {
        scrollWheelZoom: false,
        attributionControl: true,
      });
      mapRef.current = map;

      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '© OpenStreetMap contributors',
        })
        .addTo(map);

      if (places.length === 0) {
        // Centre on the pilot region so an empty day still shows context.
        map.setView([11.2, 76.8], 9);
        return;
      }

      const points: Array<[number, number]> = places.map((place) => [place.lat, place.lng]);

      for (const [index, place] of places.entries()) {
        leaflet
          .marker([place.lat, place.lng], {
            title: place.name,
            alt: `${index + 1}. ${place.name}`,
            keyboard: true,
          })
          .addTo(map)
          .bindPopup(`<strong>${escapeHtml(place.name)}</strong>`);
      }

      if (points.length > 1) {
        leaflet.polyline(points, { color: '#0F766E', weight: 3, opacity: 0.8 }).addTo(map);
        map.fitBounds(leaflet.latLngBounds(points), { padding: [32, 32] });
      } else {
        map.setView(points[0], 13);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current !== null) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [places]);

  return (
    <div>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />

      <div
        ref={containerRef}
        role="application"
        aria-label="Map of the places on this day"
        className="h-[420px] w-full overflow-hidden rounded-[16px] border border-border-subtle"
      />

      {/*
        The list equivalent. Not decorative: it is how keyboard and screen
        reader users reach the same places the pins represent.
      */}
      <ul
        aria-label="Places on this map"
        className="mt-3 divide-y divide-border-subtle rounded-[16px] border border-border-subtle"
      >
        {places.length === 0 && (
          <li className="p-3 text-[14px] text-text-secondary">No places on this day yet.</li>
        )}
        {places.map((place, index) => (
          <li key={place.id} className="p-3">
            <a
              href={`/places/${place.slug}`}
              data-touch-target
              className="flex min-h-[44px] items-center gap-3 text-[14px]"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[13px] font-[650] text-white"
              >
                {index + 1}
              </span>
              <span className="font-[650]">{place.name}</span>
              <span className="capitalize text-text-secondary">
                {place.category.replace(/_/g, ' ')}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
