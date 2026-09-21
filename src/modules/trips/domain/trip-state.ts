import { DomainError } from '@/shared/result';
import type { TripStatus } from './types';

/**
 * Trip lifecycle — PRD Part II §6.5 constrains the stored values; the
 * permitted movements between them are a domain rule, tested without a
 * database.
 */
const TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  draft: ['upcoming', 'cancelled'],
  // A trip can go back to draft while the traveler is still editing it.
  upcoming: ['draft', 'active', 'cancelled'],
  active: ['completed', 'cancelled'],
  // A completed trip is history. It is not revived or cancelled after the fact.
  completed: [],
  cancelled: ['draft'],
};

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (canTransition(from, to)) return;
  throw new DomainError(
    'trip.invalid_transition',
    `A trip cannot move from ${from} to ${to}.`,
    409,
  );
}

export function allowedTransitions(from: TripStatus): readonly TripStatus[] {
  return TRANSITIONS[from];
}
