-- Adds per-client frontmatter template for sites with a fixed MDX schema
-- (e.g. DisputeShield uses category enum + internalLinks + readTime).

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS frontmatter_template TEXT;

COMMENT ON COLUMN client_profiles.frontmatter_template IS
  'Optional YAML template the draft prompt must emit verbatim. Useful when the downstream site requires a specific frontmatter shape.';
