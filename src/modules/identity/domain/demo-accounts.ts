import type { Portal } from './portals';

/**
 * Demonstration accounts and their passwords.
 *
 * These guard seeded demonstration data only. The sign-in pages show them
 * outside production so a judge or tester can get in, and the seed refuses
 * to run in production, so they never protect anything real.
 */

export const DEMO_ACCOUNTS: ReadonlyArray<{
  portal: Portal;
  label: string;
  detail: string;
  email: string;
  password: string;
}> = [
  {
    portal: 'traveller',
    label: 'Demo traveller',
    detail: 'Plans trips and carries them offline',
    email: 'traveller@demo.dreamdestination.invalid',
    password: 'Traveller@2026',
  },
  {
    portal: 'business',
    label: 'Badaga Home Kitchen',
    detail: 'One live listing and two in review',
    email: 'owner.kitchen@demo.dreamdestination.invalid',
    password: 'Owner@2026',
  },
  {
    portal: 'business',
    label: 'Nilgiri Tea Collective',
    detail: 'A sponsored listing',
    email: 'owner.tea@demo.dreamdestination.invalid',
    password: 'Owner@2026',
  },
  {
    portal: 'staff',
    label: 'Tourism admin',
    detail: 'Every operations screen',
    email: 'admin@demo.dreamdestination.invalid',
    password: 'Admin@2026',
  },
  {
    portal: 'staff',
    label: 'Verifier',
    detail: 'Review queues only',
    email: 'verifier@demo.dreamdestination.invalid',
    password: 'Verifier@2026',
  },
];
