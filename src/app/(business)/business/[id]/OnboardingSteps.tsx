import Link from 'next/link';
import type { OwnerCopy } from '../copy';

/** Where the owner is in setting up a listing: details, evidence, preview. */
export function OnboardingSteps({
  businessId,
  current,
  copy,
}: {
  businessId: string;
  current: 'details' | 'evidence' | 'preview';
  copy: OwnerCopy;
}) {
  const steps = [
    { key: 'details', label: copy.stepDetails, href: `/business/${businessId}/details` },
    { key: 'evidence', label: copy.stepEvidence, href: `/business/${businessId}/evidence` },
    { key: 'preview', label: copy.stepPreview, href: `/business/${businessId}/preview` },
  ] as const;

  return (
    <nav aria-label="Steps">
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, index) => (
          <li key={step.key}>
            <Link
              href={step.href}
              aria-current={step.key === current ? 'step' : undefined}
              data-touch-target
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-[14px] font-[650] ${
                step.key === current ? 'bg-brand-deep text-white' : 'border border-border-subtle hover:bg-surface-subtle'
              }`}
            >
              <span aria-hidden="true">{index + 1}</span>
              {step.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
