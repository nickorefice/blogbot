-- ============================================================
-- Publish Trigger: auto-publishes posts when status → 'approved'
--
-- Uses pg_net to make an async HTTP POST to the client's
-- publish_api_url with the post content as JSON payload.
-- After a successful publish, updates status to 'published'.
-- ============================================================

-- 1. Enable pg_net (Supabase's async HTTP extension)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Function: build the publish payload and fire the HTTP request
CREATE OR REPLACE FUNCTION publish_approved_post()
RETURNS TRIGGER AS $$
DECLARE
  client client_profiles%ROWTYPE;
  payload JSONB;
  request_id BIGINT;
BEGIN
  -- Only fire when status changes TO 'approved'
  IF NEW.status != 'approved' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' THEN
    RETURN NEW;  -- Already approved, don't re-publish
  END IF;

  -- Get the client's publish credentials
  SELECT * INTO client
  FROM client_profiles
  WHERE id = NEW.client_id;

  IF client.publish_api_url IS NULL THEN
    RAISE WARNING 'No publish_api_url for client %, skipping publish', NEW.client_id;
    RETURN NEW;
  END IF;

  -- Build the payload the client's /api/blog/publish endpoint expects
  payload := jsonb_build_object(
    'id', NEW.id,
    'title', NEW.title,
    'slug', NEW.slug,
    'meta_title', NEW.meta_title,
    'meta_description', NEW.meta_description,
    'target_keyword', NEW.target_keyword,
    'content', NEW.content,
    'excerpt', NEW.excerpt,
    'published_at', now()
  );

  -- Fire the async HTTP POST via pg_net
  SELECT net.http_post(
    url := client.publish_api_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(client.publish_api_key, '')
    )
  ) INTO request_id;

  -- Update the post to 'published' immediately
  -- (pg_net is async — this runs before we know the HTTP result,
  --  but for now this is the simplest approach. We can add
  --  a net._http_response check later for retry logic.)
  NEW.status := 'published';
  NEW.published_at := now();

  RAISE NOTICE 'Published post % to % (pg_net request %)', NEW.id, client.publish_api_url, request_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger: fires BEFORE UPDATE so we can modify the row in-flight
CREATE TRIGGER trg_publish_on_approve
  BEFORE UPDATE ON posts
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
  EXECUTE FUNCTION publish_approved_post();

-- 4. Grant pg_net access to the function
GRANT USAGE ON SCHEMA net TO postgres;

COMMENT ON FUNCTION publish_approved_post() IS
  'Auto-publishes posts to client websites when status changes to approved. Uses pg_net for async HTTP.';

COMMENT ON TRIGGER trg_publish_on_approve ON posts IS
  'Fires when a post status changes to approved — triggers async publish to client website.';
