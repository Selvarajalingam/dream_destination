'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Leaflet map of the destinations on Explore, with OpenStreetMap tiles.
 *
 * Same approach as the trip map: Leaflet is imported dynamically so it never
 * enters the server bundle. Pins outside the current filter are faded, and
 * every pin is also a card in the list beside it, so the map is never the
 * only way to reach a destination.
 */

export type ExploreMapPoint = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  active: boolean;
};

export function ExploreMap({ points }: { points: ExploreMapPoint[] }) {
  const router = useRouter();
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

      const map = leaflet.map(containerRef.current, { scrollWheelZoom: false });
      mapRef.current = map;

      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '© OpenStreetMap contributors',
        })
        .addTo(map);

      if (points.length === 0) {
        map.setView([11.2, 76.8], 9);
        return;
      }

      // Circle markers need no image assets, so there is no broken default icon.
      for (const point of points) {
        leaflet
          .circleMarker([point.lat, point.lng], {
            radius: point.active ? 9 : 6,
            color: '#ffffff',
            weight: 2,
            fillColor: point.active ? '#0F766E' : '#94a3b8',
            fillOpacity: point.active ? 1 : 0.7,
          })
          .addTo(map)
          .bindTooltip(point.name, {
            permanent: point.active,
            direction: 'right',
            offset: [10, 0],
            className: 'explore-map-label',
          })
          .on('click', () => router.push(`/destinations/${point.slug}`));
      }

      const focus = points.filter((point) => point.active);
      const bounds = leaflet.latLngBounds((focus.length > 0 ? focus : points).map((p) => [p.lat, p.lng]));
      if (focus.length === 1) map.setView(bounds.getCenter(), 11);
      else map.fitBounds(bounds, { padding: [48, 48] });
    })();

    return () => {
      cancelled = true;
      if (mapRef.current !== null) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [points, router]);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <style>{`.explore-map-label{font-weight:700;font-size:12px;border-radius:6px;padding:2px 6px}`}</style>
      <div
        ref={containerRef}
        role="application"
        aria-label="Map of destinations in the pilot region"
        className="h-[420px] w-full lg:h-[560px]"
      />
    </>
  );
}
