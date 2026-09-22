/**
 * Incident reports — PRD Part I A06 and backlog E09-S07.
 *
 * A06: "Show severity, location, evidence, reporter privacy, listing state,
 * owner response, and action log. 'Suspend immediately' remains available for
 * high-risk reports."
 *
 * E09-S07: "Authorized admin can suspend a place from an incident. Public
 * discovery removes the place immediately. Resolution and reinstatement
 * remain auditable."
 */

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export type IncidentCategory =
  | 'danger'
  | 'access'
  | 'closed'
  | 'crowding'
  | 'information'
  | 'conduct'
  | 'other';

/**
 * Categories a traveller chooses from, in plain words. The traveller describes
 * what they saw; they are not asked to judge severity, because a frightened
 * person and a mildly annoyed one will both reach for "urgent".
 */
export const REPORT_CATEGORIES: ReadonlyArray<{ key: IncidentCategory; label: string }> = [
  { key: 'danger', label: 'Someone could be hurt here right now' },
  { key: 'access', label: 'The path or road is blocked or unsafe' },
  { key: 'closed', label: 'It is closed, but listed as open' },
  { key: 'crowding', label: 'It is dangerously overcrowded' },
  { key: 'conduct', label: 'A problem with how a business treated me' },
  { key: 'information', label: 'The details listed are wrong' },
  { key: 'other', label: 'Something else' },
];

/**
 * Initial severity from the category. A triager can change it; this is where
 * it starts, and it errs toward the more serious reading.
 */
export function initialSeverity(category: IncidentCategory): IncidentSeverity {
  switch (category) {
    case 'danger':
      return 'critical';
    case 'access':
      return 'high';
    case 'crowding':
    case 'closed':
    case 'conduct':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * "Suspend immediately" is for high-risk reports. A low or medium report must
 * have its severity raised first, which is audited, so a suspension always
 * follows a recorded judgement that the report was serious.
 */
export function canSuspend(severity: IncidentSeverity): boolean {
  return severity === 'high' || severity === 'critical';
}

const TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  open: ['investigating', 'resolved', 'dismissed'],
  investigating: ['resolved', 'dismissed'],
  // A report can be reopened if the problem comes back or the resolution was
  // wrong. Nothing is ever deleted.
  resolved: ['open'],
  dismissed: ['open'],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Minimum length for the reasons attached to consequential actions. */
export const MIN_ACTION_REASON = 10;

/** Minimum and maximum length of a traveller's description. */
export const MIN_REPORT_LENGTH = 15;
export const MAX_REPORT_LENGTH = 2000;

/**
 * Strips anything that looks like contact details or precise coordinates
 * from a traveller's report before it is stored.
 *
 * PRD Part I §13 forbids recording continuous precise location, and the
 * triage screen must respect reporter privacy. A report is useful without
 * the reporter's phone number in it, and nobody should be able to reach them
 * through the admin area.
 */
export function redactReport(text: string): string {
  return (
    text
      // Email addresses.
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email removed]')
      // Indian and international phone numbers, with or without separators.
      .replace(/(\+?\d[\d\s-]{8,}\d)/g, '[phone removed]')
      // Decimal coordinate pairs such as "11.4155, 76.7076".
      .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[location removed]')
      .trim()
  );
}

/** Where a severity sits in the triage queue. Lower is more urgent. */
export function severityRank(severity: IncidentSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}
