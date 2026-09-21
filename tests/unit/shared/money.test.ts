import { describe, expect, it } from 'vitest';
import { formatInr, formatInrRange, minorToRupees, rupeesToMinor, sumMinor } from '@/shared/money';

describe('money', () => {
  it('converts rupees to integer minor units without float drift', () => {
    expect(rupeesToMinor(25000)).toBe(2500000);
    expect(rupeesToMinor(1234.56)).toBe(123456);
    expect(rupeesToMinor(0.1 + 0.2)).toBe(30);
  });

  it('formats minor units as Indian rupees', () => {
    expect(formatInr(2500000)).toBe('₹25,000');
    expect(formatInr(123456)).toBe('₹1,234.56');
  });

  it('sums minor units exactly', () => {
    expect(sumMinor([100, 250, 33])).toBe(383);
    expect(sumMinor([])).toBe(0);
  });

  it('round-trips through rupees', () => {
    expect(minorToRupees(2500000)).toBe(25000);
  });

  it('formats a range, collapsing when low equals high', () => {
    expect(formatInrRange(900000, 2200000)).toBe('₹9,000–₹22,000');
    expect(formatInrRange(900000, 900000)).toBe('₹9,000');
  });
});
