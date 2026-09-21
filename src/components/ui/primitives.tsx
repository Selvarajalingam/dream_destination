import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';

/**
 * UI primitives built on the PRD Part I §4 tokens.
 *
 * Touch targets are at least 44×44 CSS pixels, focus is always visible, and
 * nothing conveys state through colour alone (§11).
 */

export function Button({
  variant = 'primary',
  size = 'medium',
  className,
  ...props
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'medium' | 'small';
}) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-[650] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'medium' ? 'min-h-[44px] px-5 text-[16px]' : 'min-h-[44px] px-3 text-[14px]',
        variant === 'primary' && 'bg-brand-primary text-white hover:bg-brand-primary-hover',
        variant === 'secondary' &&
          'border border-border-subtle bg-surface-base text-text-primary hover:bg-surface-subtle',
        variant === 'ghost' && 'text-brand-primary hover:bg-surface-subtle',
        variant === 'danger' && 'bg-status-danger text-white hover:brightness-95',
        className,
      )}
      style={{ transitionDuration: 'var(--duration-standard)' }}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        'elevation-1 rounded-[16px] border border-border-subtle bg-surface-base',
        className,
      )}
    />
  );
}

export function Chip({
  selected = false,
  className,
  ...props
}: ComponentProps<'button'> & { selected?: boolean }) {
  return (
    <button
      {...props}
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-[650]',
        selected
          ? 'border-brand-primary bg-brand-primary text-white'
          : 'border-border-subtle bg-surface-base text-text-primary hover:bg-surface-subtle',
        className,
      )}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      {...props}
      className={clsx('text-[13px] font-[650] uppercase tracking-wide text-text-secondary', className)}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={clsx('animate-pulse rounded-lg bg-surface-subtle', className)}
    />
  );
}

/**
 * Segmented control for Timeline / Map (T09). Implemented with real tabs so
 * keyboard users get arrow-key navigation and screen readers announce the
 * relationship.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-xl border border-border-subtle bg-surface-subtle p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'min-h-[44px] rounded-lg px-4 text-[14px] font-[650]',
            value === option.value
              ? 'bg-surface-base text-text-primary elevation-1'
              : 'text-text-secondary',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet on mobile, dialog on wider screens. 24px top radius per §4.3. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="elevation-3 relative max-h-[85vh] w-full overflow-y-auto rounded-t-[24px] bg-surface-base p-5 sm:max-w-lg sm:rounded-[16px]"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-[21px] font-[650]">{title}</h2>
          <Button variant="ghost" size="small" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Meter({
  value,
  max,
  tone,
  label,
}: {
  value: number;
  max: number;
  tone: 'good' | 'warn' | 'danger';
  label: string;
}) {
  const percent = max === 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-3 w-full overflow-hidden rounded-full bg-surface-subtle"
    >
      <div
        className={clsx(
          'h-full rounded-full',
          tone === 'good' && 'bg-status-good',
          tone === 'warn' && 'bg-status-warn',
          tone === 'danger' && 'bg-status-danger',
        )}
        style={{ width: `${percent}%`, transitionDuration: 'var(--duration-standard)' }}
      />
    </div>
  );
}
