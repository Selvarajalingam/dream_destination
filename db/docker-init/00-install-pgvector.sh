#!/bin/bash
# The postgis image does not bundle pgvector, which the PRD's knowledge_chunks
# table requires (Part II §6.10). Install it once, at first container start.
set -euo pipefail

apt-get update -qq
apt-get install -y -qq --no-install-recommends "postgresql-${PG_MAJOR}-pgvector"
rm -rf /var/lib/apt/lists/*
