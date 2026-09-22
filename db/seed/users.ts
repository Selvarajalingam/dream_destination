import { DEMO_ACCOUNTS } from '../../src/modules/identity/domain/demo-accounts';
import { hashPassword } from '../../src/server/password';
import type { SeedSql } from './types';

/**
 * Demonstration accounts. Their passwords are the demonstration ones listed
 * in src/modules/identity/domain/demo-accounts.ts, stored only as scrypt
 * hashes. Real credentials never belong in a seed script.
 */

export type UserKey = 'traveler' | 'verifier' | 'admin' | 'owner_tea' | 'owner_kitchen';

type UserSeed = {
  key: UserKey;
  displayName: string;
  email: string;
  roles: Array<'traveler' | 'business_owner' | 'verifier' | 'tourism_admin' | 'platform_admin' | 'analyst'>;
};

const USERS: UserSeed[] = [
  { key: 'traveler', displayName: 'Demo Traveller', email: 'traveller@demo.dreamdestination.invalid', roles: ['traveler'] },
  { key: 'verifier', displayName: 'Demo Verifier', email: 'verifier@demo.dreamdestination.invalid', roles: ['verifier'] },
  {
    key: 'admin',
    displayName: 'Demo Tourism Admin',
    email: 'admin@demo.dreamdestination.invalid',
    roles: ['tourism_admin', 'verifier'],
  },
  {
    key: 'owner_tea',
    displayName: 'Demo Owner (tea collective)',
    email: 'owner.tea@demo.dreamdestination.invalid',
    roles: ['business_owner'],
  },
  {
    key: 'owner_kitchen',
    displayName: 'Demo Owner (home kitchen)',
    email: 'owner.kitchen@demo.dreamdestination.invalid',
    roles: ['business_owner'],
  },
];

export async function seedUsers(tx: SeedSql): Promise<Record<UserKey, string>> {
  const ids = {} as Record<UserKey, string>;

  for (const user of USERS) {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO users (email, display_name, preferred_locale, status)
      VALUES (${user.email}, ${user.displayName}, 'en-IN', 'active')
      RETURNING id
    `;
    ids[user.key] = row.id;

    for (const role of user.roles) {
      await tx`
        INSERT INTO user_roles (user_id, role, scope_type)
        VALUES (${row.id}, ${role}, 'global')
      `;
    }

    // A preference profile so the Dream Score has something to personalise on
    // without requiring the demo to complete T02 first.
    if (user.key === 'traveler') {
      await tx`
        INSERT INTO preference_profiles (
          user_id, crowd_tolerance, travel_pace, budget_style,
          preferred_transport, interests, accessibility_preferences, memory_enabled
        ) VALUES (
          ${row.id}, 'low', 'relaxed', 'balanced',
          ${tx.array(['car', 'train'])},
          ${tx.array(['nature', 'heritage', 'local_food'])},
          ${tx.json({ lowWalking: true, medicalAccessRequired: true })},
          true
        )
      `;
      await tx`
        INSERT INTO consent_records (user_id, purpose, policy_version, granted)
        VALUES (${row.id}, 'preference_memory', '2026-09-01', true)
      `;
    }
  }

  for (const account of DEMO_ACCOUNTS) {
    const [user] = await tx<{ id: string }[]>`SELECT id FROM users WHERE email = ${account.email}`;
    if (user === undefined) continue;
    await tx`
      INSERT INTO user_credentials (user_id, password_hash)
      VALUES (${user.id}, ${await hashPassword(account.password)})
    `;
  }

  return ids;
}
