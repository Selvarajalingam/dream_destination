import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CATEGORIES,
  REQUIRED_EVIDENCE,
  closureState,
  evidenceSummary,
  listingGaps,
  normalizePhone,
  ownerMode,
  parseDraftPatch,
  slugFor,
  splitUpdate,
  submissionBlockers,
  validateClosure,
  validateHours,
  type OwnerListing,
} from '@/modules/businesses/domain/listing';
import { EVENT_CATALOGUE } from '@/modules/analytics/domain/events';

const complete: OwnerListing = {
  name: 'Coonoor Honey House',
  category: 'shop',
  description: 'Forest honey from Kurumba collectors.',
  addressLine: '12 Church Road',
  locality: 'Coonoor',
  pin: '643101',
  lat: 11.35,
  lng: 76.79,
  locationConfirmed: true,
  phone: '+914232201111',
  ownerName: 'R. Devi',
  hours: { mon: ['09:00', '18:00'] },
  priceBand: 2,
  services: ['Tasting'],
  paymentMethods: ['cash', 'upi'],
  accessibility: { stepFreeEntry: true },
};

describe('normalizePhone', () => {
  it('accepts Indian mobile and landline numbers in the usual forms', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('0423 220 0101')).toBe('+914232200101');
  });

  it('refuses short, long or foreign numbers', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+44 20 7946 0958')).toBeNull();
    expect(normalizePhone('0987654321')).toBeNull();
  });
});

describe('validateHours', () => {
  it('accepts closed days and coherent opening times', () => {
    expect(validateHours({ mon: ['09:00', '18:00'], tue: null })).toBeNull();
  });

  it('refuses a closing time before opening, and malformed times', () => {
    expect(validateHours({ mon: ['18:00', '09:00'] })).toMatch(/after opening/);
    expect(validateHours({ mon: ['9am', '18:00'] })).toMatch(/24-hour/);
  });
});

describe('parseDraftPatch (B02 autosave)', () => {
  it('keeps the valid fields and reports the invalid ones', () => {
    const { values, errors } = parseDraftPatch({ name: '  Honey House ', pin: '6431', phone: '98765 43210' });
    expect(values).toEqual({ name: 'Honey House', phone: '+919876543210' });
    expect(Object.keys(errors)).toEqual(['pin']);
  });

  it('never stores a field the form does not own', () => {
    const { values, errors } = parseDraftPatch({ status: 'active', sponsored: true, owner_user_id: 'x' });
    expect(values).toEqual({});
    expect(Object.keys(errors).sort()).toEqual(['owner_user_id', 'sponsored', 'status']);
  });

  it('turns an emptied optional field into null rather than an empty string', () => {
    expect(parseDraftPatch({ description: '   ' }).values).toEqual({ description: null });
  });

  it('refuses a map pin far outside the pilot region', () => {
    expect(parseDraftPatch({ location: { lat: 51.5, lng: -0.12 } }).errors.location).toBeDefined();
  });
});

describe('listingGaps and submissionBlockers (B03, B04)', () => {
  it('finds nothing missing on a complete listing with evidence', () => {
    expect(listingGaps(complete, 1)).toEqual([]);
    expect(submissionBlockers(complete, 1, new Set(['registration', 'address_proof']))).toEqual([]);
  });

  it('treats an unplaced map pin as trust-critical', () => {
    const gaps = listingGaps({ ...complete, locationConfirmed: false }, 1);
    expect(gaps).toEqual([expect.objectContaining({ field: 'location', critical: true })]);
  });

  it('treats photos, price band and accessibility as advice, not blockers', () => {
    const gaps = listingGaps({ ...complete, priceBand: null, accessibility: {} }, 0);
    expect(gaps.every((gap) => !gap.critical)).toBe(true);
    expect(gaps.map((gap) => gap.field).sort()).toEqual(['accessibility', 'photos', 'priceBand']);
  });

  it('asks for the evidence this category needs', () => {
    const blockers = submissionBlockers({ ...complete, category: 'restaurant' }, 1, new Set(['address_proof']));
    expect(blockers).toEqual([expect.stringMatching(/FSSAI/)]);
  });

  it('asks every category for a registration and an address proof', () => {
    for (const category of BUSINESS_CATEGORIES) {
      expect(REQUIRED_EVIDENCE[category].map((item) => item.kind).sort()).toEqual(['address_proof', 'registration']);
    }
  });
});

describe('ownerMode', () => {
  it('lets the owner edit a draft or a listing returned for changes, and nothing in review', () => {
    expect(ownerMode('draft', null)).toBe('editing');
    expect(ownerMode('pending', 'changes_requested')).toBe('editing');
    expect(ownerMode('pending', 'under_review')).toBe('in_review');
    expect(ownerMode('active', 'approved')).toBe('live');
    expect(ownerMode('rejected', 'rejected')).toBe('closed');
    expect(ownerMode('suspended', 'approved')).toBe('closed');
  });
});

describe('splitUpdate (B06)', () => {
  it('holds name, address, pin and owner changes for review and applies the rest', () => {
    const { rapid, sensitive } = splitUpdate({
      hours: { mon: null },
      phone: '+919876543210',
      name: 'New name',
      ownerName: 'Someone else',
      location: { lat: 11.4, lng: 76.7 },
    });
    expect(Object.keys(rapid).sort()).toEqual(['hours', 'phone']);
    expect(Object.keys(sensitive).sort()).toEqual(['location', 'name', 'ownerName']);
  });
});

describe('temporary closure', () => {
  const today = '2026-09-22';

  it('accepts a closure starting today and refuses one that has ended or runs backwards', () => {
    expect(validateClosure({ from: today, until: '2026-09-25', note: null }, today)).toBeNull();
    expect(validateClosure({ from: '2026-09-01', until: '2026-09-10', note: null }, today)).toMatch(/already ended/);
    expect(validateClosure({ from: '2026-09-25', until: '2026-09-23', note: null }, today)).toMatch(/on or after/);
  });

  it('caps a temporary closure at ninety days', () => {
    expect(validateClosure({ from: today, until: '2027-03-01', note: null }, today)).toMatch(/at most 90 days/);
  });

  it('reads as active, upcoming or ended against today', () => {
    expect(closureState({ from: '2026-09-20', until: '2026-09-22', note: null }, today)).toBe('active');
    expect(closureState({ from: '2026-09-23', until: '2026-09-24', note: null }, today)).toBe('upcoming');
    expect(closureState({ from: '2026-09-10', until: '2026-09-21', note: null }, today)).toBe('ended');
    expect(closureState(null, today)).toBe('none');
  });
});

describe('evidenceSummary', () => {
  it('describes what was supplied without claiming anything was confirmed', () => {
    const summary = evidenceSummary(complete, [{ evidenceKind: 'registration', originalName: 'gst.pdf' }]);
    expect(Object.keys(summary).sort()).toEqual(['address', 'businessType', 'contact', 'hours', 'ownership']);
    expect(summary.ownership).toMatch(/gst\.pdf/);
    expect(summary.address).toMatch(/nothing uploaded/);
    // "not yet verified" is the opposite of a claim.
    expect(Object.values(summary).join(' ')).not.toMatch(/(?<!not yet )\b(confirmed|verified)\b/i);
  });
});

describe('slugFor', () => {
  it('builds a readable slug that two same-named businesses cannot share', () => {
    expect(slugFor('Café  Nilgiri & Sons', 'a1b2c3')).toBe('cafe-nilgiri-sons-a1b2c3');
    expect(slugFor('தமிழ்', 'a1b2c3')).toBe('business-a1b2c3');
  });
});

describe('categories', () => {
  it('match the categories the analytics catalogue accepts', () => {
    const schema = EVENT_CATALOGUE.business_contact.shape.category;
    expect([...schema.options].sort()).toEqual([...BUSINESS_CATEGORIES].sort());
  });
});

describe('hours in a draft', () => {
  it('accepts a week with some days left out', () => {
    expect(parseDraftPatch({ hours: { mon: ['09:00', '17:00'], sun: null } }).errors).toEqual({});
  });
});
