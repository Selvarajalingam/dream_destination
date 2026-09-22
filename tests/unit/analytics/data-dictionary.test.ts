import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENT_NAMES } from '@/modules/analytics/domain/events';

/**
 * PRD E14-S06 requires a data dictionary defining every event. A dictionary
 * that is not checked against the code drifts the first time someone adds an
 * event, so this test keeps the two in lockstep.
 */

const dictionary = readFileSync('docs/analytics-data-dictionary.md', 'utf8');

describe('analytics data dictionary', () => {
  it('documents every event in the catalogue', () => {
    const missing = EVENT_NAMES.filter((name) => !dictionary.includes(`\`${name}\``));
    expect(missing).toEqual([]);
  });

  it('documents no event that the catalogue does not define', () => {
    const documented = [...dictionary.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]);
    const unknown = documented.filter((name) => !(EVENT_NAMES as string[]).includes(name));
    expect(unknown).toEqual([]);
  });

  it('states the prohibited data, the owner and the retention period', () => {
    expect(dictionary).toMatch(/\*\*Prohibited:\*\*/);
    expect(dictionary).toMatch(/\*\*Owner:\*\*/);
    expect(dictionary).toMatch(/\*\*Retention:\*\*/);
  });
});
