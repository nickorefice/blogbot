/**
 * Stage 5 — Post-Processing & Queue
 *
 * Validates the draft, generates slug if missing, and writes to Supabase
 * with status 'pending_review'.
 */

import { supabase } from '../supabase.js';

/**
 * Convert a title to a URL-friendly slug.
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Ensure slug is unique for this client.
 * Appends -2, -3, etc. if needed.
 */
async function ensureUniqueSlug(clientId, slug, existingSlugs) {
  let candidate = slug;
  let counter = 2;

  while (existingSlugs.includes(candidate)) {
    candidate = `${slug}-${counter}`;
    counter++;
  }

  return candidate;
}

/**
 * Generate an excerpt from the body if not provided in frontmatter.
 */
function generateExcerpt(body, maxLength = 200) {
  // Take first paragraph that isn't an H1
  const lines = body.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const firstParagraph = lines[0] || '';
  if (firstParagraph.length <= maxLength) return firstParagraph;
  return firstParagraph.slice(0, maxLength - 3) + '...';
}

export async function queuePost(context, topic, outline, draft) {
  console.log('\n[Stage 5] Validating and queueing post...');

  const { clientId, existingSlugs } = context;
  const { frontmatter, body, raw } = draft;

  // Build post data, filling in gaps
  const title = frontmatter.title || topic.title;
  const rawSlug = frontmatter.slug || slugify(title);
  const slug = await ensureUniqueSlug(clientId, rawSlug, existingSlugs);
  const metaTitle = frontmatter.meta_title || title;
  const metaDescription = frontmatter.meta_description || outline.meta_description || '';
  const targetKeyword = frontmatter.target_keyword || topic.target_keyword;
  const excerpt = frontmatter.excerpt || generateExcerpt(body);

  // Validation checks
  const issues = [];
  if (!title) issues.push('Missing title');
  if (!metaDescription) issues.push('Missing meta description');
  if (metaDescription.length > 160) issues.push(`Meta description too long (${metaDescription.length} chars)`);
  if (!targetKeyword) issues.push('Missing target keyword');
  if (!body || body.length < 200) issues.push('Content too short');
  if (!excerpt) issues.push('Could not generate excerpt');

  if (issues.length > 0) {
    console.warn(`  ⚠ Validation issues:`);
    issues.forEach(i => console.warn(`    - ${i}`));
    // Continue anyway — these are warnings, not blockers
  }

  // Write to Supabase
  const postData = {
    client_id: clientId,
    title,
    slug,
    meta_title: metaTitle,
    meta_description: metaDescription,
    target_keyword: targetKeyword,
    content: raw, // Full markdown with frontmatter — the iOS app renders it
    excerpt,
    status: 'pending_review'
  };

  const { data, error } = await supabase
    .from('posts')
    .insert(postData)
    .select('id, title, slug, status')
    .single();

  if (error) {
    throw new Error(`Failed to write post to Supabase: ${error.message}`);
  }

  console.log(`  ✓ Post queued successfully`);
  console.log(`  ✓ ID: ${data.id}`);
  console.log(`  ✓ Title: ${data.title}`);
  console.log(`  ✓ Slug: ${data.slug}`);
  console.log(`  ✓ Status: ${data.status}`);

  return data;
}
