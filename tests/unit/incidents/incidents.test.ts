import { describe, expect, it } from 'vitest';
import {
  REPORT_CATEGORIES,
  canSuspend,
  canTransition,
  initialSeverity,
  redactReport,
  severityRank,
} from '@/modules/incidents/domain/incidents';

describe('initialSeverity', () => {
  it('treats immediate danger as critical', () => {
    expect(initialSeverity('danger')).toBe('critical');
  });

  it('treats a blocked or unsafe path as high', () => {
    expect(initialSeverity('access')).toBe('high');
  });

  it('treats a wrong listing detail as low', () => {
    expect(initialSeverity('information')).toBe('low');
  });

  it('gives every category a reporter can choose a severity', () => {
    for (const category of REPORT_CATEGORIES) {
      expect(['low', 'medium', 'high', 'critical']).toContain(initialSeverity(category.key));
    }
  });
});

describe('canSuspend', () => {
  it('allows immediate suspension only for high-risk reports', () => {
    expect(canSuspend('critical')).toBe(true);
    expect(canSuspend('high')).toBe(true);
    expect(canSuspend('medium')).toBe(false);
    expect(canSuspend('low')).toBe(false);
  });
});

describe('canTransition', () => {
  it('moves a report through triage', () => {
    expect(canTransition('open', 'investigating')).toBe(true);
    expect(canTransition('investigating', 'resolved')).toBe(true);
  });

  it('allows a resolved or dismissed report to be reopened', () => {
    expect(canTransition('resolved', 'open')).toBe(true);
    expect(canTransition('dismissed', 'open')).toBe(true);
  });

  it('does not let a closed report jump straight to investigating', () => {
    expect(canTransition('resolved', 'investigating')).toBe(false);
  });
});

describe('redactReport', () => {
  it('removes email addresses', () => {
    expect(redactReport('Contact me at priya.k+trip@example.com please')).toBe(
      'Contact me at [email removed] please',
    );
  });

  it('removes phone numbers in common formats', () => {
    expect(redactReport('Call 98765 43210 anytime')).toBe('Call [phone removed] anytime');
    expect(redactReport('My number is +91-98765-43210.')).toBe('My number is [phone removed].');
  });

  it('removes precise coordinate pairs', () => {
    expect(redactReport('I was at 11.41552, 76.70761 when it happened')).toBe(
      'I was at [location removed] when it happened',
    );
  });

  it('leaves ordinary text, times and small numbers intact', () => {
    const text = 'Path collapsed about 2 km past the gate at 10:30, two people turned back.';
    expect(redactReport(text)).toBe(text);
  });
});

describe('severityRank', () => {
  it('orders critical first', () => {
    const ordered = (['low', 'critical', 'medium', 'high'] as const)
      .slice()
      .sort((a, b) => severityRank(a) - severityRank(b));
    expect(ordered).toEqual(['critical', 'high', 'medium', 'low']);
  });
});
