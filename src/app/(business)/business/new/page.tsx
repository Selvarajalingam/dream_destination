import { catalogRepository } from '@/modules/catalog/repository';
import { Card } from '@/components/ui/primitives';
import { ownerContext } from '../context';
import { StartForm } from './StartForm';

/**
 * Screen B01 — Business Onboarding Start.
 *
 * "Explain eligibility, required information, verification, and what the
 * platform does with business data. Offer local-language selection."
 * The language switch sits in the header of every owner screen.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Register a business' };

export default async function OnboardingStartPage() {
  const context = await ownerContext();
  if (context === null) return null;
  const { copy } = context;

  const destinations = await catalogRepository.listAllDestinations();

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">{copy.startTitle}</h1>
      <p className="mt-2 text-[16px] text-text-secondary">{copy.startLead}</p>

      <div className="mt-5 space-y-4">
        <Section title={copy.eligibilityTitle} items={copy.eligibility} />
        <Section title={copy.requiredTitle} items={copy.required} />
        <Card className="p-4">
          <h2 className="text-[18px] font-[650]">{copy.verificationTitle}</h2>
          <p className="mt-2 text-[16px]">{copy.verification}</p>
        </Card>
        <Section title={copy.dataTitle} items={copy.data} />
      </div>

      <Card className="mt-6 border-brand-primary/30 p-4">
        <h2 className="text-[21px] font-[650]">{copy.startFormTitle}</h2>
        <p className="mt-1 text-[14px] text-text-secondary">{copy.progressSaved}</p>
        <StartForm
          destinations={destinations.map((destination) => ({ slug: destination.slug, name: destination.name }))}
          labels={{
            businessName: copy.businessName,
            area: copy.area,
            areaHelp: copy.areaHelp,
            startAction: copy.startAction,
            starting: copy.starting,
          }}
        />
      </Card>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="p-4">
      <h2 className="text-[18px] font-[650]">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[16px]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}
