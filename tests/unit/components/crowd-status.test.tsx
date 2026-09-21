import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CrowdStatusBadge, type CrowdStatusView } from '@/components/patterns/CrowdStatusBadge';

const heavy: CrowdStatusView = {
  band: 'heavy',
  label: 'Heavy crowd',
  source: 'override',
  confidence: 0.9,
  confidenceLabel: 'High confidence',
  observedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  isStale: false,
  explanation: 'Set by the local tourism authority: Festival procession',
};

describe('CrowdStatusBadge', () => {
  it('renders a text label, not colour alone', () => {
    render(<CrowdStatusBadge status={heavy} />);
    expect(screen.getByTestId('crowd-label')).toHaveTextContent('Heavy crowd');
  });

  it('renders an icon with an accessible name matching the state', () => {
    render(<CrowdStatusBadge status={heavy} />);
    expect(screen.getByRole('img', { name: 'Heavy crowd' })).toBeInTheDocument();
  });

  it('shows how long ago the reading was taken', () => {
    render(<CrowdStatusBadge status={heavy} />);
    expect(screen.getByText(/updated 12 minutes ago/i)).toBeInTheDocument();
  });

  it('shows the confidence label', () => {
    render(<CrowdStatusBadge status={heavy} />);
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
  });

  it('offers a Why action that explains the source', async () => {
    const user = userEvent.setup();
    render(<CrowdStatusBadge status={heavy} />);

    await user.click(screen.getByRole('button', { name: /why/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/festival procession/i)).toBeInTheDocument();
  });

  it('renders the unknown state without implying the place is quiet', () => {
    render(
      <CrowdStatusBadge
        status={{
          ...heavy,
          band: 'unknown',
          label: 'Unknown',
          source: 'none',
          observedAt: null,
          explanation: 'No current crowd information is available for this place.',
        }}
      />,
    );
    expect(screen.getByTestId('crowd-label')).toHaveTextContent('Unknown');
    expect(screen.queryByText(/comfortable/i)).not.toBeInTheDocument();
  });

  it('marks a stale reading rather than hiding it', () => {
    render(<CrowdStatusBadge status={{ ...heavy, isStale: true }} />);
    expect(screen.getByText(/may be out of date/i)).toBeInTheDocument();
    expect(screen.getByTestId('crowd-label')).toHaveTextContent('Heavy crowd');
  });

  it('never uses the word live', () => {
    const { container } = render(<CrowdStatusBadge status={heavy} />);
    expect(container.textContent).not.toMatch(/\blive\b/i);
  });

  it('distinguishes all four bands by their label', () => {
    for (const [band, label] of [
      ['comfortable', 'Comfortable'],
      ['moderate', 'Moderate'],
      ['heavy', 'Heavy crowd'],
      ['unknown', 'Unknown'],
    ] as const) {
      const { unmount } = render(<CrowdStatusBadge status={{ ...heavy, band, label }} />);
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
      unmount();
    }
  });

  it('shows a time range when the status is tied to a visit window', () => {
    render(<CrowdStatusBadge status={heavy} timeRange="11:00–13:00" />);
    expect(screen.getByText('11:00–13:00')).toBeInTheDocument();
  });
});
