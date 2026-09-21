import type { Sql } from 'postgres';

/**
 * Demonstration accounts. No passwords are stored: the pilot authentication
 * route is an open production decision (PRD Part II §20), so the demo signs in
 * by selecting a role. Real credentials never belong in a seed script.
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

export async function seedUsers(tx: Sql): Promise<Record<UserKey, string>> {
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

  return ids;
}
