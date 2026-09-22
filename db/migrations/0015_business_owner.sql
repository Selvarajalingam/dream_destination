-- PRD Part I B01–B06, backlog E10-S05 to E10-S07 — the business owner flow.

-- What an owner can keep current without a review (B06), and a slot for the
-- one sensitive change that is waiting for one.
ALTER TABLE local_businesses
  ADD COLUMN services TEXT[] NOT NULL DEFAULT '{}',
  -- Set by the owner from a map pin. A draft starts at its area's centre and
  -- is not submittable until the owner places the pin themselves.
  ADD COLUMN location_confirmed BOOLEAN NOT NULL DEFAULT true,
  -- {"from": "2026-10-01", "until": "2026-10-05", "note": "..."}
  ADD COLUMN temporary_closure JSONB,
  ADD COLUMN availability_note TEXT CHECK (char_length(availability_note) <= 140),
  -- Name, category, address, pin or owner changes wait here until A07 decides.
  -- The live listing keeps its reviewed values meanwhile.
  ADD COLUMN pending_change JSONB;

-- A listing's first review and a later sensitive change go through the same
-- A07 queue, but a declined change must not take a live listing down.
ALTER TABLE business_verifications
  ADD COLUMN request_kind TEXT NOT NULL DEFAULT 'listing'
    CHECK (request_kind IN ('listing', 'sensitive_change'));

-- Photos and verification evidence. The bytes live in object storage, never
-- in a public directory; every read goes through an authorised route.
CREATE TABLE business_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES local_businesses(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('photo', 'evidence')),
  evidence_kind TEXT,
  original_name TEXT NOT NULL CHECK (char_length(original_name) <= 200),
  -- The type found by reading the file's first bytes, not the one declared.
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((purpose = 'evidence') = (evidence_kind IS NOT NULL))
);

CREATE INDEX business_files_business_idx ON business_files(business_id, purpose);
CREATE INDEX local_businesses_owner_idx ON local_businesses(owner_user_id);
