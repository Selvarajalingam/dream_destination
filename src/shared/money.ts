/**
 * All monetary values move through the system as integers in minor units
 * (paise). PRD Part II §7.1: "Currency stored in minor units."
 */

export function rupeesToMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

export function minorToRupees(minor: number): number {
  return minor / 100;
}

export function sumMinor(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const WHOLE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const FRACTION = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹25,000" for whole rupees, "₹1,234.56" when paise are significant. */
export function formatInr(minor: number): string {
  const formatter = minor % 100 === 0 ? WHOLE : FRACTION;
  return formatter.format(minorToRupees(minor)).replace(/\u00a0/g, '');
}

/** "₹9,000–₹22,000", collapsing to a single value when the bounds match. */
export function formatInrRange(lowMinor: number, highMinor: number): string {
  return lowMinor === highMinor
    ? formatInr(lowMinor)
    : `${formatInr(lowMinor)}\u2013${formatInr(highMinor)}`;
}
