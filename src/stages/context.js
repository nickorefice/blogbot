/**
 * Stage 1 — Client Context Loader
 *
 * Pulls the client's profile and existing post titles from Supabase.
 * Also checks for any recently rejected posts (to regenerate with feedback).
 */

import { supabase } from '../supabase.js';

export async function loadClientContext(clientId) {
  console.log(`\n[Stage 1] Loading context for client ${clientId}...`);

  // Fetch client profile
  const { data: profile, error: profileError } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('id', clientId)
    .single();

  if (profileError || !profile) {
    throw new Error(
      `Client profile not found for ${clientId}: ${profileError?.message || 'no data'}\n` +
      `Run "npm run seed" first if using the test user.`
    );
  }

  // Fetch existing post titles to avoid duplication
  const { data: existingPosts, error: postsError } = await supabase
    .from('posts')
    .select('title, slug, status')
    .eq('client_id', clientId)
    .in('status', ['pending_review', 'approved', 'published']);

  if (postsError) {
    throw new Error(`Failed to fetch existing posts: ${postsError.message}`);
  }

  const existingTitles = (existingPosts || []).map(p => `${p.title} (slug: ${p.slug})`);
  const existingSlugs = (existingPosts || []).map(p => p.slug);

  // Check for recently rejected posts — agent can use rejection notes as feedback
  const { data: rejectedPosts } = await supabase
    .from('posts')
    .select('title, target_keyword, rejection_note, created_at')
    .eq('client_id', clientId)
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(5);

  const context = {
    profile,
    existingTitles,
    existingSlugs,
    rejectedPosts: rejectedPosts || [],
    clientId
  };

  console.log(`  ✓ Profile: ${profile.business_name} (${profile.industry})`);
  console.log(`  ✓ ${existingTitles.length} existing post(s)`);
  console.log(`  ✓ ${context.rejectedPosts.length} recently rejected post(s)`);

  return context;
}
