-- PRD Part II §6.8 — Verification.
CREATE TABLE hidden_gem_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  status verification_status NOT NULL DEFAULT 'draft',
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  known_limitations TEXT[],
  reviewer_user_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  decision_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one approved verification may exist per place. PRD Part II §19.
CREATE UNIQUE INDEX one_active_hidden_verification_idx
  ON hidden_gem_verifications(place_id)
  WHERE status = 'approved';

CREATE TABLE verification_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id UUID NOT NULL REFERENCES hidden_gem_verifications(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  checksum TEXT NOT NULL,
  captured_at TIMESTAMPTZ,
  source_id UUID REFERENCES source_records(id),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
