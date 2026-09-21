-- PRD Part II §6.1 — Extensions and enums.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM (
  'traveler', 'business_owner', 'verifier',
  'tourism_admin', 'platform_admin', 'analyst'
);

CREATE TYPE record_status AS ENUM (
  'draft', 'pending', 'active', 'suspended', 'expired', 'rejected'
);

CREATE TYPE verification_status AS ENUM (
  'draft', 'evidence_pending', 'under_review', 'approved',
  'changes_requested', 'rejected', 'expired', 'suspended', 'suppressed'
);

CREATE TYPE crowd_band AS ENUM ('comfortable', 'moderate', 'heavy', 'unknown');

CREATE TYPE source_type AS ENUM (
  'government', 'authority', 'contracted_provider',
  'verified_owner', 'verified_curator', 'community_lead', 'seeded_demo'
);
