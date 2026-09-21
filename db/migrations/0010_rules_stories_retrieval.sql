-- PRD Part II §6.10 — Rules, stories, and retrieval.
CREATE TABLE rule_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  destination_id UUID REFERENCES destinations(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  plain_language_summary TEXT NOT NULL,
  official_text_excerpt TEXT,
  source_id UUID NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  effective_from DATE,
  effective_to DATE,
  verified_at TIMESTAMPTZ NOT NULL,
  review_due_at TIMESTAMPTZ NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  CHECK (place_id IS NOT NULL OR destination_id IS NOT NULL)
);

CREATE TABLE story_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('fact', 'community_story', 'legend', 'guide')),
  title TEXT NOT NULL,
  short_text TEXT NOT NULL,
  long_text TEXT,
  locale TEXT NOT NULL DEFAULT 'en-IN',
  source_ids UUID[] NOT NULL DEFAULT '{}',
  status record_status NOT NULL DEFAULT 'draft',
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  source_id UUID REFERENCES source_records(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en-IN',
  chunk_text TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_embedding_idx
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
