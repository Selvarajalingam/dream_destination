# PostGIS and pgvector in one image. The PRD (Part II §4/§6) requires both:
# PostGIS for destination/place/help geography, pgvector for knowledge_chunks.
# The official postgis image does not bundle pgvector, so install it here.
FROM postgis/postgis:16-3.4

RUN apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-${PG_MAJOR}-pgvector" \
 && rm -rf /var/lib/apt/lists/*
