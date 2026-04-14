-- Adds fields used by the Stage 6 publish step (src/stages/publish.js)
-- to record the outcome of pushing an approved post to the client's
-- publish_api_url. Also extends the status CHECK to allow 'failed'
-- (distinct from 'rejected' which is a human decision).

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS published_url  TEXT,
  ADD COLUMN IF NOT EXISTS publish_error  TEXT;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts ADD CONSTRAINT posts_status_check
  CHECK (status IN (
    'generating',
    'pending_review',
    'approved',
    'published',
    'rejected',
    'failed'
  ));

COMMENT ON COLUMN posts.published_url IS
  'URL returned by the client site on successful publish (e.g. https://site.com/blog/slug).';
COMMENT ON COLUMN posts.publish_error IS
  'Error message recorded when a publish attempt fails terminally (4xx or retries exhausted).';
