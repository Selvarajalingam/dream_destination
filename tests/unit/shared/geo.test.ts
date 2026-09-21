import { describe, expect, it } from 'vitest';
import { haversineMeters } from '@/shared/geo';

describe('haversineMeters', () => {
  it('returns zero for identical points', () => {
    const p = { lat: 11.0168, lng: 76.9558 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it('measures Coimbatore to Ooty within 2% of the great-circle distance', () => {
    const coimbatore = { lat: 11.0168, lng: 76.9558 };
    const ooty = { lat: 11.4102, lng: 76.695 };
    const meters = haversineMeters(coimbatore, ooty);
    expect(meters).toBeGreaterThan(48_000);
    expect(meters).toBeLessThan(54_000);
  });
});
