-- ============================================================
-- Supabase Schema Migration
-- Run this in the Supabase SQL Editor to create the tables
-- ============================================================

-- Every refinement outcome (anonymized, no prompt text)
CREATE TABLE IF NOT EXISTS refinement_outcomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  weakness_type TEXT NOT NULL,
  strategy TEXT NOT NULL,
  score_before INT,
  score_after INT,
  score_delta INT GENERATED ALWAYS AS (score_after - score_before) STORED,
  platform TEXT DEFAULT 'unknown',
  user_rating SMALLINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Aggregated best practices (rebuilt incrementally)
CREATE TABLE IF NOT EXISTS pattern_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  weakness_type TEXT NOT NULL,
  best_strategy TEXT NOT NULL,
  avg_score_delta FLOAT,
  sample_count INT DEFAULT 0,
  confidence FLOAT DEFAULT 0,
  tip_text TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (weakness_type, best_strategy)
);

-- Index for fast pattern lookups
CREATE INDEX IF NOT EXISTS idx_pattern_weakness ON pattern_library (weakness_type);
CREATE INDEX IF NOT EXISTS idx_outcomes_weakness ON refinement_outcomes (weakness_type);

-- Enable Row Level Security (RLS)
ALTER TABLE refinement_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_library ENABLE ROW LEVEL SECURITY;

-- Allow server-side inserts (service role key)
CREATE POLICY "service_insert_outcomes" ON refinement_outcomes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_select_outcomes" ON refinement_outcomes
  FOR SELECT USING (true);

CREATE POLICY "service_all_patterns" ON pattern_library
  FOR ALL USING (true) WITH CHECK (true);
