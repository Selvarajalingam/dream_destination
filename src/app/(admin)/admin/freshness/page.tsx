import { freshnessRepository } from '@/modules/operations/freshness-repository';
import { FreshnessBoard } from './FreshnessBoard';

/**
 * Screen A05 — Content Freshness.
 *
 * Stale and expiring rules, emergency facilities, operating-hours sources and
 * business records, grouped. Assignment and bulk reminders are available;
 * bulk approval is not (PRD E11-S07).
 */

export const dynamic = 'force-dynamic';

export default async function FreshnessPage() {
  const [items, reviewers] = await Promise.all([
    freshnessRepository.listDue(),
    freshnessRepository.assignableReviewers(),
  ]);

  return (
    <FreshnessBoard
      reviewers={reviewers}
      items={items.map((item) => ({
        ...item,
        reviewDueAt: item.reviewDueAt?.toISOString() ?? null,
        lastRemindedAt: item.lastRemindedAt?.toISOString() ?? null,
      }))}
    />
  );
}
