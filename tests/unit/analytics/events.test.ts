import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EVENT_CATALOGUE, EVENT_NAMES, FUNNEL, validateEvent } from '@/modules/analytics/domain/events';

const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('event catalogue privacy (E14-S01)', () => {
  /**
   * Walks a schema and reports any property that would accept arbitrary
   * text. Enums and uuids are closed sets; a plain string is not.
   */
  type Def = {
    type: string;
    shape?: Record<string, z.ZodTypeAny>;
    innerType?: z.ZodTypeAny;
    // Zod 4 records string formats such as uuid as checks, not on the def.
    checks?: Array<{ _zod?: { def?: { format?: string } } }>;
  };

  function freeTextFields(schema: z.ZodTypeAny, path = ''): string[] {
    const def = (schema as unknown as { _zod: { def: Def } })._zod.def;

    if (def.type === 'object' && def.shape !== undefined) {
      return Object.entries(def.shape).flatMap(([key, value]) => freeTextFields(value, `${path}${key}.`));
    }
    if (def.type === 'optional' && def.innerType !== undefined) return freeTextFields(def.innerType, path);
    if (def.type === 'string') {
      const isUuid = (def.checks ?? []).some((check) => check._zod?.def?.format === 'uuid');
      return isUuid ? [] : [path.slice(0, -1)];
    }
    return [];
  }

  it('would catch a free-text property if one were added', () => {
    // A guard that cannot fail proves nothing, so check it on a bad schema.
    const bad = z.object({ ok: z.string().uuid(), note: z.string() }).strict();
    expect(freeTextFields(bad)).toEqual(['note']);
  });

  it('contains no free-text property on any event', () => {
    const offenders = EVENT_NAMES.flatMap((name) =>
      freeTextFields(EVENT_CATALOGUE[name]).map((field) => `${name}.${field}`),
    );
    expect(offenders).toEqual([]);
  });

  it('refuses a chat message smuggled into an event', () => {
    const result = validateEvent('brief_started', { mode: 'llm', message: 'I have asthma, travelling from 12 Park Rd' });
    expect(result.ok).toBe(false);
  });

  it('refuses coordinates smuggled into an event', () => {
    const result = validateEvent('help_opened', { source: 'navigation', lat: 11.41, lng: 76.7 });
    expect(result.ok).toBe(false);
  });

  it('refuses an event name that is not in the catalogue', () => {
    expect(validateEvent('page_scrolled', {}).ok).toBe(false);
  });
});

describe('validateEvent', () => {
  it('accepts a well-formed event and lifts out its entity', () => {
    const result = validateEvent('business_contact', { businessId: uuid, category: 'cafe' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.entityType).toBe('business');
      expect(result.event.entityId).toBe(uuid);
    }
  });

  it('lifts a trip id when there is no more specific entity', () => {
    const result = validateEvent('offline_pack_saved', { tripId: uuid, outcome: 'saved' });
    expect(result.ok && result.event.entityType).toBe('trip');
  });

  it('rejects an out-of-range value rather than clamping it', () => {
    expect(validateEvent('help_opened', { source: 'navigation', msToOpen: -5 }).ok).toBe(false);
  });

  it('rejects a category outside the catalogue', () => {
    expect(validateEvent('business_contact', { businessId: uuid, category: 'casino' }).ok).toBe(false);
  });
});

describe('funnel', () => {
  it('only names events that exist', () => {
    for (const stage of FUNNEL) expect(EVENT_NAMES).toContain(stage);
  });
});
