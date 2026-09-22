import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { freshnessRepository } from '@/modules/operations/freshness-repository';

afterAll(async () => {
  await sql.end();
});

const adminId = async (): Promise<string> => {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = 'admin@demo.dreamdestination.invalid'
  `;
  return row.id;
};

describe('freshnessRepository.listDue (A05)', () => {
  it('covers all four PRD groups where the seed has something due', async () => {
    const items = await freshnessRepository.listDue();
    const groups = new Set(items.map((item) => item.entityType));
    expect(groups).toEqual(new Set(['rule', 'source', 'business']));
  });

  it('includes the two rules the seed leaves past review', async () => {
    const items = await freshnessRepository.listDue();
    const staleRules = items.filter((item) => item.entityType === 'rule' && item.state === 'stale');
    expect(staleRules).toHaveLength(2);
    expect(staleRules.every((item) => (item.daysOverdue ?? 0) > 0)).toBe(true);
  });

  it('lists an hours source with the places that depend on it', async () => {
    const items = await freshnessRepository.listDue();
    const hours = items.find((item) => item.entityType === 'source' && item.state === 'stale');
    expect(hours).toBeDefined();
    expect(hours!.context).toMatch(/^Backs hours for /);
    expect(hours!.context).toMatch(/St Stephen/);
  });

  it('flags the business whose owner has not confirmed in over ninety days', async () => {
    const items = await freshnessRepository.listDue();
    const stale = items.filter((item) => item.entityType === 'business' && item.state === 'stale');
    expect(stale.map((item) => item.title)).toEqual(['Wellington Chai Corner']);
  });

  it('does not list recently confirmed businesses at all', async () => {
    const items = await freshnessRepository.listDue();
    expect(items.some((item) => item.title === 'Nilgiri Heritage Cabs')).toBe(false);
  });

  it('orders the most overdue first', async () => {
    const items = await freshnessRepository.listDue();
    const overdue = items.map((item) => item.daysOverdue ?? Number.MAX_SAFE_INTEGER);
    expect([...overdue].sort((a, b) => b - a)).toEqual(overdue);
  });
});

describe('freshness actions', () => {
  it('assigns a record to a reviewer', async () => {
    const admin = await adminId();
    const [target] = (await freshnessRepository.listDue()).filter((item) => item.entityType === 'rule');

    await freshnessRepository.assign({
      entityType: 'rule',
      entityId: target.id,
      assignedTo: admin,
      assignedBy: admin,
      note: null,
    });

    const after = (await freshnessRepository.listDue()).find((item) => item.id === target.id);
    expect(after!.assignedToId).toBe(admin);
    expect(after!.assignedToName).toBe('Demo Tourism Admin');
  });

  it('accumulates reminders without changing the record state', async () => {
    const admin = await adminId();
    const [target] = (await freshnessRepository.listDue()).filter((item) => item.entityType === 'source');

    await freshnessRepository.remind([{ entityType: 'source', entityId: target.id }], admin);
    await freshnessRepository.remind([{ entityType: 'source', entityId: target.id }], admin);

    const after = (await freshnessRepository.listDue()).find((item) => item.id === target.id);
    expect(after!.reminderCount).toBe(2);
    // A reminder is not an approval. The record is exactly as stale as before.
    expect(after!.state).toBe(target.state);
  });

  it('removes a single re-verified rule from the due list', async () => {
    const admin = await adminId();
    const [target] = (await freshnessRepository.listDue()).filter(
      (item) => item.entityType === 'rule' && item.state === 'stale',
    );

    const result = await freshnessRepository.reverify('rule', target.id, admin, 'Checked the circle office notice board.');
    expect(result).not.toBeNull();
    expect(result!.after.getTime()).toBeGreaterThan(Date.now());

    const after = await freshnessRepository.listDue();
    expect(after.some((item) => item.id === target.id)).toBe(false);

    // Travellers stop seeing the stale warning on that rule.
    const [rule] = await sql<{ stale: boolean }[]>`SELECT review_due_at < now() AS stale FROM rule_content WHERE id = ${target.id}`;
    expect(rule.stale).toBe(false);
  });

  it('records a business re-verification as a verification event, not an owner update', async () => {
    const admin = await adminId();
    const [target] = (await freshnessRepository.listDue()).filter(
      (item) => item.entityType === 'business' && item.state === 'stale',
    );

    const [before] = await sql<{ last_owner_update_at: Date }[]>`
      SELECT last_owner_update_at FROM local_businesses WHERE id = ${target.id}
    `;

    await freshnessRepository.reverify('business', target.id, admin, 'Phoned the owner; Monday hours confirmed.');

    const [after] = await sql<{ last_owner_update_at: Date }[]>`
      SELECT last_owner_update_at FROM local_businesses WHERE id = ${target.id}
    `;
    expect(after.last_owner_update_at.getTime()).toBe(before.last_owner_update_at.getTime());

    const verifications = await sql`
      SELECT 1 FROM business_verifications
      WHERE business_id = ${target.id} AND reviewer_user_id = ${admin} AND status = 'approved'
    `;
    expect(verifications.length).toBe(1);

    expect((await freshnessRepository.listDue()).some((item) => item.id === target.id)).toBe(false);
  });

  it('returns null for a record that does not exist', async () => {
    const admin = await adminId();
    expect(
      await freshnessRepository.reverify('rule', '00000000-0000-0000-0000-000000000000', admin, 'Nothing to see here at all.'),
    ).toBeNull();
  });
});
