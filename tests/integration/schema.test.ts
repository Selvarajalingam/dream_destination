import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';

afterAll(async () => {
  await sql.end();
});

describe('schema', () => {
  it('has postgis, vector, pgcrypto and citext installed', async () => {
    const rows = await sql<{ extname: string }[]>`SELECT extname FROM pg_extension`;
    const names = rows.map((row) => row.extname);
    expect(names).toEqual(expect.arrayContaining(['postgis', 'vector', 'pgcrypto', 'citext']));
  });

  it('allows only one approved verification per place', async () => {
    const indexes = await sql<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE indexname = 'one_active_hidden_verification_idx'
    `;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain("status = 'approved'");
  });

  it('rejects a crowd override that expires before it starts', async () => {
    await expect(
      sql.begin(async (tx) => {
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (display_name) VALUES ('schema test') RETURNING id
        `;
        const [destination] = await tx<{ id: string }[]>`
          INSERT INTO destinations (slug, name, state_code, summary, center)
          VALUES ('schema-test-dest', 'Schema Test', 'TN', 'test',
                  ST_SetSRID(ST_MakePoint(76.95, 11.01), 4326)::geography)
          RETURNING id
        `;
        const [place] = await tx<{ id: string }[]>`
          INSERT INTO places (destination_id, slug, name, category, location)
          VALUES (${destination.id}, 'schema-test-place', 'Schema Test Place', 'attraction',
                  ST_SetSRID(ST_MakePoint(76.95, 11.01), 4326)::geography)
          RETURNING id
        `;
        await tx`
          INSERT INTO crowd_overrides (place_id, band, reason, starts_at, expires_at, created_by)
          VALUES (${place.id}, 'heavy', 'test',
                  now() + interval '2 hours', now(), ${user.id})
        `;
      }),
    ).rejects.toThrow();
  });

  it('stores destination centers as geography points with a GIST index', async () => {
    const [column] = await sql<{ udt: string }[]>`
      SELECT udt_name AS udt FROM information_schema.columns
      WHERE table_name = 'destinations' AND column_name = 'center'
    `;
    expect(column.udt).toBe('geography');

    const indexes = await sql`SELECT 1 FROM pg_indexes WHERE indexname = 'destinations_geo_idx'`;
    expect(indexes).toHaveLength(1);
  });

  it('stores currency in BIGINT minor units', async () => {
    const columns = await sql<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'budgets' AND column_name LIKE '%_minor'
    `;
    expect(columns.length).toBeGreaterThanOrEqual(4);
    expect(columns.every((column) => column.data_type === 'bigint')).toBe(true);
  });

  it('gives knowledge chunks a 1536-dimension vector with an HNSW index', async () => {
    const indexes = await sql<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'knowledge_embedding_idx'
    `;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain('hnsw');
    expect(indexes[0].indexdef).toContain('vector_cosine_ops');
  });
});
