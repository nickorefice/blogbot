-- Drops the pg_net-based auto-publish trigger in favor of
-- src/stages/publish.js, which uses HMAC-SHA256 auth and the
-- {id, slug, mdx} payload shape expected by DisputeShield.
--
-- The Node-side publish stage gives us:
--   - Proper HMAC signing (the old trigger sent Bearer auth)
--   - Correct payload shape (mdx, not meta_title/meta_description/content)
--   - Retries with exponential backoff on 5xx/network errors
--   - Response-aware status updates (published vs failed + publish_error)
--
-- The old trigger is obsolete. Keep its SQL file (003) in the history
-- for audit but ensure the objects it created are removed.

DROP TRIGGER IF EXISTS trg_publish_on_approve ON posts;
DROP FUNCTION IF EXISTS publish_approved_post() CASCADE;
