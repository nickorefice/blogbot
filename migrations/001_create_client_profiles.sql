-- Client profiles — stores everything the agent needs to generate content
-- client_id maps directly to auth.users(id), no separate clients table

CREATE TABLE IF NOT EXISTS client_profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL,
  domain              TEXT,
  industry            TEXT,
  target_audience     TEXT,
  seed_keywords       TEXT[] DEFAULT '{}',
  brand_voice         TEXT,
  publish_api_url     TEXT,
  publish_api_key     TEXT,
  generation_cadence  TEXT DEFAULT 'weekly' CHECK (generation_cadence IN ('daily', 'weekly', 'biweekly', 'monthly')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- RLS: service role bypasses, but set up policies for future app access
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON client_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Service role full access"
  ON client_profiles FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE client_profiles IS 'Client context for the blog agent — industry, keywords, voice, publish credentials';
