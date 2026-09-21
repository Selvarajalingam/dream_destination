import { describe, expect, it } from 'vitest';
import { canTransition, assertTransition } from '@/modules/trips/domain/trip-state';

describe('canTransition', () => {
  it('allows the forward planning path', () => {
    expect(canTransition('draft', 'upcoming')).toBe(true);
    expect(canTransition('upcoming', 'active')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
  });

  it('forbids skipping straight from draft to active', () => {
    expect(canTransition('draft', 'active')).toBe(false);
  });

  it('forbids reviving a completed trip', () => {
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('completed', 'draft')).toBe(false);
  });

  it('allows cancelling from any pre-completion state', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('upcoming', 'cancelled')).toBe(true);
    expect(canTransition('active', 'cancelled')).toBe(true);
    expect(canTransition('completed', 'cancelled')).toBe(false);
  });

  it('allows returning an upcoming trip to draft for further editing', () => {
    expect(canTransition('upcoming', 'draft')).toBe(true);
  });

  it('treats a transition to the same state as a no-op, not an error', () => {
    expect(canTransition('draft', 'draft')).toBe(true);
    expect(canTransition('completed', 'completed')).toBe(true);
  });
});

describe('assertTransition', () => {
  it('throws a domain error naming both states', () => {
    expect(() => assertTransition('completed', 'active')).toThrowError(/completed.*active/i);
  });

  it('does not throw for a permitted transition', () => {
    expect(() => assertTransition('upcoming', 'active')).not.toThrow();
  });
});
