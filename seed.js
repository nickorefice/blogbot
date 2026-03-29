import { supabase } from './src/supabase.js';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

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

async function seed() {
  console.log('Seeding test client profile...');

  const { data, error } = await supabase
    .from('client_profiles')
    .upsert(testProfile, { onConflict: 'id' })
    .select();

  if (error) {
    console.error('Failed to seed:', error.message);
    process.exit(1);
  }

  console.log('Seeded client profile:', data[0].business_name);
  console.log('Client ID:', data[0].id);
  console.log('\nReady to run: npm run agent -- --client-id ' + TEST_USER_ID);
}

seed();
