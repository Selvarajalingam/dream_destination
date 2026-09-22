import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  DreamVerifiedBadge,
  KnownLimitations,
  SourceFreshnessLabel,
  type VerificationView,
} from '@/components/patterns/trust';

const approved: VerificationView = {
  showBadge: true,
  status: 'approved',
  verifiedAt: '2026-09-12T00:00:00.000Z',
  nextReviewAt: '2027-03-12T00:00:00.000Z',
  knownLimitations: ['Mobile coverage becomes unreliable during the final 2 km.'],
  reviewerType: 'District tourism office field check',
  checklistGroups: [
    { key: 'access_and_road', label: 'Access and road conditions', value: 'Gravel final 2 km.', checked: true },
  ],
};

describe('DreamVerifiedBadge', () => {
  it('renders nothing when the verification is not approved', () => {
    const { container } = render(
      <DreamVerifiedBadge display={{ ...approved, showBadge: false, status: 'under_review' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when an approved verification has expired', () => {
    // The gate resolves an expired approval to showBadge false; the component
    // must not second-guess that.
    const { container } = render(
      <DreamVerifiedBadge display={{ ...approved, showBadge: false, status: 'expired' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the badge for an approved unexpired verification', () => {
    render(<DreamVerifiedBadge display={approved} />);
    expect(screen.getByText(/dream verified/i)).toBeInTheDocument();
  });

  it('opens a sheet with the verification date, review date and reviewer', async () => {
    const user = userEvent.setup();
    render(<DreamVerifiedBadge display={approved} />);

    await user.click(screen.getByTestId('dream-verified-badge'));
    expect(screen.getByTestId('verified-on')).toHaveTextContent('12 Sep 2026');
    expect(screen.getByTestId('next-review')).toHaveTextContent('12 Mar 2027');
    expect(screen.getByTestId('reviewer-type')).toHaveTextContent(/district tourism office/i);
  });

  it('lists known limitations and renders the report control it is given', async () => {
    const user = userEvent.setup();
    render(
      <DreamVerifiedBadge display={approved} report={<button type="button">Report a concern</button>} />,
    );

    await user.click(screen.getByTestId('dream-verified-badge'));
    expect(screen.getByText(/mobile coverage becomes unreliable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /report a concern/i })).toBeInTheDocument();
  });

  it('renders no dead report button when no report control is supplied', async () => {
    const user = userEvent.setup();
    render(<DreamVerifiedBadge display={approved} />);

    await user.click(screen.getByTestId('dream-verified-badge'));
    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument();
  });

  it('states plainly that the badge is not a guarantee', async () => {
    const user = userEvent.setup();
    render(<DreamVerifiedBadge display={approved} />);

    await user.click(screen.getByTestId('dream-verified-badge'));
    expect(screen.getByText(/not a guarantee/i)).toBeInTheDocument();
  });
});

describe('KnownLimitations', () => {
  it('renders nothing when there are none', () => {
    const { container } = render(<KnownLimitations limitations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders every limitation under a heading', () => {
    render(<KnownLimitations limitations={['No mobile coverage.', 'Unmade track.']} />);
    expect(screen.getByText('No mobile coverage.')).toBeInTheDocument();
    expect(screen.getByText('Unmade track.')).toBeInTheDocument();
  });
});

describe('SourceFreshnessLabel', () => {
  it('renders the PRD pattern: authority then verified date', () => {
    render(
      <SourceFreshnessLabel
        source={{
          name: 'District Tourism Office listings',
          issuingAuthority: 'District Tourism Office',
          verifiedAt: '2026-09-12T00:00:00.000Z',
          reviewDueAt: '2027-01-12T00:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByTestId('issuing-authority')).toHaveTextContent('District Tourism Office');
    expect(screen.getByTestId('last-verified')).toHaveTextContent('Verified 12 Sep 2026');
    expect(screen.queryByTestId('stale-warning')).not.toBeInTheDocument();
  });

  it('warns rather than hiding once the review date has passed', () => {
    render(
      <SourceFreshnessLabel
        source={{
          name: 'Protected monument notices',
          issuingAuthority: 'Archaeological Survey of India',
          verifiedAt: '2025-01-01T00:00:00.000Z',
          reviewDueAt: '2025-06-01T00:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByTestId('stale-warning')).toBeInTheDocument();
    // The information itself is still on screen.
    expect(screen.getByTestId('issuing-authority')).toHaveTextContent('Archaeological Survey');
  });

  it('links to the source when there is one', () => {
    render(
      <SourceFreshnessLabel
        source={{
          name: 'Forest rules',
          issuingAuthority: 'Tamil Nadu Forest Department',
          verifiedAt: '2026-09-01T00:00:00.000Z',
          reviewDueAt: '2027-01-01T00:00:00.000Z',
          url: 'https://example.gov.in/rules',
        }}
      />,
    );
    expect(screen.getByRole('link', { name: /source/i })).toHaveAttribute(
      'href',
      'https://example.gov.in/rules',
    );
  });
});
