/**
 * Stage 6 — Publish to external site.
 *
 * Fires when a post transitions to 'approved'. Sends the raw markdown (with
 * frontmatter) to the client's publish_api_url, signed with HMAC-SHA256 over
 * the JSON body. Retries 5xx/network up to 3 times with exponential backoff.
 */

import crypto from 'node:crypto';
import { supabase } from '../supabase.js';

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} postId  posts.id UUID — the post to publish
 * @returns {Promise<{ok: boolean, status?: number, body?: string}>}
 */
export async function publish(postId) {
  console.log(`\n[Stage 6] Publishing post ${postId}...`);

  const { data: post, error: postErr } = await supabase
    .from('posts')
    .select('id, client_id, slug, title, content, status')
    .eq('id', postId)
    .single();

  if (postErr || !post) {
    throw new Error(`Post not found: ${postErr?.message || postId}`);
  }
  if (post.status !== 'approved') {
    console.log(`  ⊘ Skipping — status is ${post.status}, not approved`);
    return { ok: false, body: 'not approved' };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('client_profiles')
    .select('publish_api_url, publish_api_key')
    .eq('id', post.client_id)
    .single();

  if (profileErr || !profile) {
    throw new Error(`Client profile not found: ${post.client_id}`);
  }
  if (!profile.publish_api_url || !profile.publish_api_key) {
    console.warn('  ⚠ publish_api_url or publish_api_key not set — skipping');
    return { ok: false, body: 'publish_api not configured' };
  }

  const body = JSON.stringify({
    id: post.id,
    slug: post.slug,
    mdx: post.content,
  });
  const signature = sign(body, profile.publish_api_key);

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const res = await fetch(profile.publish_api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Blogbot-Signature': signature,
          'X-Blogbot-Id': post.id,
        },
        body,
      });
      const resText = await res.text();

      if (res.status >= 200 && res.status < 300) {
        console.log(`  ✓ Published (HTTP ${res.status})`);
        let parsed = {};
        try {
          parsed = JSON.parse(resText);
        } catch {
          // non-JSON body, fine
        }
        await supabase
          .from('posts')
          .update({
            status: 'published',
            published_url: parsed.url ?? null,
          })
          .eq('id', post.id);
        return { ok: true, status: res.status, body: resText };
      }

      // 4xx = terminal, don't retry
      if (res.status >= 400 && res.status < 500) {
        console.error(`  ✗ Publish failed (HTTP ${res.status}): ${resText}`);
        await supabase
          .from('posts')
          .update({
            status: 'failed',
            publish_error: `HTTP ${res.status}: ${resText.slice(0, 1000)}`,
          })
          .eq('id', post.id);
        return { ok: false, status: res.status, body: resText };
      }

      // 5xx = retry
      if (attempt < RETRY_DELAYS_MS.length) {
        console.warn(
          `  ⚠ HTTP ${res.status}, retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s...`,
        );
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      await supabase
        .from('posts')
        .update({
          status: 'failed',
          publish_error: `HTTP ${res.status} after ${RETRY_DELAYS_MS.length} retries`,
        })
        .eq('id', post.id);
      return { ok: false, status: res.status, body: resText };
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        console.warn(
          `  ⚠ Network error (${err.message}), retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s...`,
        );
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      await supabase
        .from('posts')
        .update({
          status: 'failed',
          publish_error: `Network: ${err.message}`,
        })
        .eq('id', post.id);
      return { ok: false, body: err.message };
    }
  }

  return { ok: false, body: 'unreachable' };
}
