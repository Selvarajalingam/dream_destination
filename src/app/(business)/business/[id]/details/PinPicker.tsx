'use client';

import { useEffect, useRef } from 'react';

/**
 * Map pin for the business entrance. Tap the map or drag the pin.
 *
 * The latitude and longitude fields beside it are the equivalent for
 * keyboard and screen reader users, so the map is never the only way in.
 */

type LeafletMarker = { setLatLng: (point: [number, number]) => void };

export function PinPicker({
  lat,
  lng,
  label,
  onPick,
}: {
  lat: number;
  lng: number;
  label: string;
  onPick: (point: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void; setView: (point: [number, number]) => void } | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Built once; later coordinate changes move the pin rather than rebuilding.
  const initial = useRef({ lat, lng });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const leaflet = await import('leaflet');
      if (cancelled || containerRef.current === null) return;
      if (mapRef.current !== null) mapRef.current.remove();

      const start: [number, number] = [initial.current.lat, initial.current.lng];
      const map = leaflet.map(containerRef.current, { scrollWheelZoom: false }).setView(start, 15);
      mapRef.current = map;

      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors',
        })
        .addTo(map);

      const marker = leaflet.marker(start, { draggable: true, title: label, alt: label, keyboard: true }).addTo(map);
      markerRef.current = marker;

      const pick = (point: { lat: number; lng: number }) => {
        const rounded = { lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) };
        marker.setLatLng([rounded.lat, rounded.lng]);
        onPickRef.current(rounded);
      };

      marker.on('dragend', () => pick(marker.getLatLng()));
      map.on('click', (event: { latlng: { lat: number; lng: number } }) => pick(event.latlng));
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [label]);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    markerRef.current?.setLatLng([lat, lng]);
  }, [lat, lng]);

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
        aria-label={label}
        className="h-[280px] w-full overflow-hidden rounded-[16px] border border-border-subtle"
      />
    </div>
  );
}
