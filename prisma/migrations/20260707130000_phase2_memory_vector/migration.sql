-- Phase 2: semantic memory search via pgvector (pre-installed on Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- 768-dim embeddings from gemini-embedding-001 (outputDimensionality: 768)
ALTER TABLE "memories" ADD COLUMN "embedding" vector(768);
