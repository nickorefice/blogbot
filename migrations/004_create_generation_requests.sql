-- Generation requests — iOS app inserts a row, local agent picks it up via Realtime

CREATE TABLE IF NOT EXISTS generation_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  error       TEXT,
  post_id     UUID REFERENCES posts(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Only one pending or in-progress request per client at a time
-- This prevents spam — if a client already has a request being processed, new inserts are rejected
CREATE UNIQUE INDEX idx_one_active_request_per_client
  ON generation_requests (client_id)
  WHERE status IN ('pending', 'in_progress');

-- RLS
ALTER TABLE generation_requests ENABLE ROW LEVEL SECURITY;

-- Clients can insert requests for themselves only
CREATE POLICY "Users can request generation for own client"
  ON generation_requests FOR INSERT
  WITH CHECK (auth.uid() = client_id);

-- Clients can read their own requests (to see status/progress)
CREATE POLICY "Users can read own requests"
  ON generation_requests FOR SELECT
  USING (auth.uid() = client_id);

-- Service role full access (agent uses this to update status)
CREATE POLICY "Service role full access"
  ON generation_requests FOR ALL
  USING (auth.role() = 'service_role');

-- Enable Realtime for this table so the local agent gets instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE generation_requests;

COMMENT ON TABLE generation_requests IS 'Queue for on-demand blog generation — iOS app inserts, local agent processes';
