import { notFound } from 'next/navigation';
import { tripsRepository } from '@/modules/trips/repository';
import { getSession } from '@/server/session';
import { BudgetEditor } from './BudgetEditor';

/**
 * Screen T08 — Budget Planner.
 *
 * Shows where the money goes and allows trade-offs. Totals update immediately
 * after a change, and live, partner, historical and manual estimates carry
 * distinct labels.
 */

export const dynamic = 'force-dynamic';

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  const trip = await tripsRepository.findById(id);

  if (trip === null || session === null || trip.ownerUserId !== session.userId) notFound();

  const budget = await tripsRepository.findBudget(id);
  if (budget === null) notFound();

  return (
    <BudgetEditor
      tripId={id}
      tripTitle={trip.destinationName ?? trip.title}
      initial={{
        totalLimitMinor: budget.totalLimitMinor,
        reserveMinor: budget.reserveMinor,
        lines: budget.lines.map((line) => ({
          id: line.id,
          category: line.category,
          description: line.description,
          lowMinor: line.lowMinor,
          expectedMinor: line.expectedMinor,
          highMinor: line.highMinor,
          priceState: line.priceState,
          refreshedAt: line.refreshedAt?.toISOString() ?? null,
          locked: line.locked,
        })),
      }}
    />
  );
}
