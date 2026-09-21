import Link from 'next/link';
import { verificationRepository } from '@/modules/verification/repository';
import { EmptyState } from '@/components/states/states';

/**
 * Screen A02 — Hidden-Gem Review Queue.
 *
 * Columns are exactly those the PRD names: place, submitter, district, risk
 * category, evidence completeness, assigned reviewer, age and status.
 */

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  under_review: 'bg-status-warn/10 text-status-warn',
  evidence_pending: 'bg-surface-subtle text-text-secondary',
  changes_requested: 'bg-status-warn/10 text-status-warn',
  approved: 'bg-status-danger/10 text-status-danger',
};

export default async function ReviewQueuePage() {
  const [queue, expiringSoon] = await Promise.all([
    verificationRepository.listQueue(),
    verificationRepository.expiringSoonCount(),
  ]);

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Hidden-gem review queue</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        {queue.length} item{queue.length === 1 ? '' : 's'} need attention.{' '}
        {expiringSoon} approved verification{expiringSoon === 1 ? '' : 's'} expire within 30 days.
      </p>

      {queue.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Queue is clear" reason="No verification is waiting for review." />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-[16px] border border-border-subtle">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className="bg-surface-subtle text-left">
                <th scope="col" className="p-3 font-[650]">Place</th>
                <th scope="col" className="p-3 font-[650]">Submitter</th>
                <th scope="col" className="p-3 font-[650]">District</th>
                <th scope="col" className="p-3 font-[650]">Risk category</th>
                <th scope="col" className="p-3 font-[650]">Evidence</th>
                <th scope="col" className="p-3 font-[650]">Reviewer</th>
                <th scope="col" className="p-3 font-[650]">Age</th>
                <th scope="col" className="p-3 font-[650]">Status</th>
                <th scope="col" className="p-3 font-[650]">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.map((entry) => (
                <tr key={entry.id} className="border-t border-border-subtle">
                  <td className="p-3 font-[650]">{entry.placeName}</td>
                  <td className="p-3 text-text-secondary">{entry.submitterName}</td>
                  <td className="p-3">{entry.district ?? '—'}</td>
                  <td className="p-3 capitalize">{entry.riskCategory.replace(/_/g, ' ')}</td>
                  <td className="p-3">{Math.round(entry.evidenceCompleteness)}%</td>
                  <td className="p-3 text-text-secondary">{entry.reviewerName ?? 'Unassigned'}</td>
                  <td className="p-3">{entry.ageDays} days</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[13px] font-[650] ${
                        STATUS_TONE[entry.status] ?? 'bg-surface-subtle text-text-secondary'
                      }`}
                    >
                      {entry.status === 'approved' ? 'expired' : entry.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/verifications/${entry.id}`}
                      data-touch-target
                      className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-3 font-[650] text-white"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
