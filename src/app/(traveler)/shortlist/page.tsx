import { Shortlist } from './Shortlist';

/**
 * Screen T04 — Destination Shortlist.
 *
 * The brief is carried from Dream AI through sessionStorage, so the shortlist
 * is computed client-side against the API rather than requiring the trip to be
 * saved first. A guest can therefore reach a shortlist without signing in.
 */
export default function ShortlistPage() {
  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Destinations that match</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        Each option shows what suits you and what does not. Costs are estimates, not quotes.
      </p>

      <Shortlist />
    </div>
  );
}
