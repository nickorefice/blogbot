import { supabase } from './src/supabase.js';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const DISPUTESHIELD_CLIENT_ID = '00000000-0000-0000-0000-000000000002';

// NOTE: This is a local fallback. The authoritative seed is in the iOS repo
// migration 00011_create_client_profiles.sql, already applied to prod Supabase.
// Only run this if you need to re-seed locally.
const testProfile = {
  id: TEST_USER_ID,
  business_name: 'Cleared',
  domain: 'clearedapp.app',
  industry: 'Photo Management & Privacy',
  target_audience: 'People going through life transitions — breakups, divorces, estrangements — who want to remove photos of specific people from their phone without losing everything else. iOS users who value privacy and emotional wellbeing.',
  seed_keywords: [
    'delete photos of ex',
    'remove someone from photos',
    'photo cleanup app',
    'delete pictures after breakup',
    'remove person from camera roll'
  ],
  brand_voice: `Empathetic and supportive, never clinical. Cleared helps people move forward — the tone should feel like a thoughtful friend, not a tech product. Acknowledge that deleting photos is emotional. Use second person ("you"). Be direct but gentle. No toxic positivity — respect the complexity of why someone might want to remove photos of a person. Privacy-first messaging: emphasize that everything happens on-device.`,
  publish_api_url: 'https://clearedapp.app/api/blog/publish',
  publish_api_key: 'test-key-replace-in-production',
  generation_cadence: 'weekly'
};

// DisputeShield client — Texas legal blog.
// publish_api_key is intentionally NULL. Set it manually via the Supabase
// SQL editor to the value of BLOGBOT_PUBLISH_SECRET on DisputeShield's
// Vercel env — NEVER commit the real key to git.
const DISPUTESHIELD_FRONTMATTER = `---
title: "<descriptive title>"
description: "<SEO meta description, 150-160 chars, plain-language summary>"
publishDate: "<YYYY-MM-DD>"
category: "<one of: HOA Disputes | Security Deposit | Maintenance | Landlord Disputes>"
keywords:
  - "<keyword 1>"
  - "<keyword 2>"
internalLinks:
  - href: "/tx/hoa-violations"
    label: "HOA Violation Response"
  - href: "/tx/security-deposit"
    label: "Security Deposit Dispute"
readTime: <integer minutes, ~200 wpm>
---

BODY RULES (DisputeShield-specific):
- Use <InlineCTA /> exactly TWICE, each on its own line: once around 40% through the article, once near the end.
- Use ## headings for main sections (at least 3).
- Cite Texas Property Code sections only when you have exact section numbers — never invent.
- Keep it plain-language for non-lawyers. No jargon without explanation.
- Target 900–1400 words.
`;

const disputeshieldProfile = {
  id: DISPUTESHIELD_CLIENT_ID,
  business_name: 'DisputeShield',
  domain: 'disputeshield.xyz',
  industry: 'Legal self-help (Texas tenant + HOA law)',
  target_audience: 'Texas renters and homeowners facing HOA fines, security-deposit disputes, maintenance denials, and landlord disputes — they need plain-language legal guidance, not lawyer-speak.',
  seed_keywords: [
    'texas hoa violation',
    'texas security deposit law',
    'fight hoa fine texas',
    'texas tenant rights',
    'texas property code chapter 209',
    'texas property code chapter 92'
  ],
  brand_voice: `Plain-language, statute-backed, calm authority. Cite Texas Property Code by section when the statute exists and the exact section is known. Never promise legal advice or legal outcomes. Avoid "you should sue" or "you will win". Instead, explain what the statute requires and let the reader draw conclusions. Target 900–1400 words.`,
  publish_api_url: 'https://disputeshield.xyz/api/blog/publish',
  publish_api_key: null,
  generation_cadence: 'weekly',
  frontmatter_template: DISPUTESHIELD_FRONTMATTER
};

async function upsertProfile(profile) {
  const { data, error } = await supabase
    .from('client_profiles')
    .upsert(profile, { onConflict: 'id' })
    .select();

  if (error) {
    console.error(`Failed to seed ${profile.business_name}:`, error.message);
    return null;
  }
  return data[0];
}

async function seed() {
  console.log('Seeding client profiles...');

  const test = await upsertProfile(testProfile);
  if (test) console.log(`  ✓ ${test.business_name} (${test.id})`);

  const ds = await upsertProfile(disputeshieldProfile);
  if (ds) {
    console.log(`  ✓ ${ds.business_name} (${ds.id})`);
    if (!ds.publish_api_key) {
      console.log('');
      console.log('  ⚠ DisputeShield publish_api_key is NULL.');
      console.log('  ⚠ Set it via Supabase SQL editor to match BLOGBOT_PUBLISH_SECRET:');
      console.log('');
      console.log(`      UPDATE client_profiles SET publish_api_key = '<secret>'`);
      console.log(`      WHERE id = '${DISPUTESHIELD_CLIENT_ID}';`);
      console.log('');
    }
  }

  console.log('\nReady to run:');
  console.log(`  npm run agent -- --client-id ${TEST_USER_ID}`);
  console.log(`  npm run agent -- --client-id ${DISPUTESHIELD_CLIENT_ID}`);
}

seed();
