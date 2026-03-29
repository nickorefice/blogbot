/**
 * Stage 2 — Topic Research & Selection
 *
 * Picks a topic based on client context, seed keywords, and existing posts.
 * Returns a structured topic brief.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callClaude } from '../claude.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_TEMPLATE = readFileSync(join(__dirname, '../prompts/topic.txt'), 'utf-8');
const BLOG_GUIDE = readFileSync(join(__dirname, '../BLOG_WRITING_GUIDE.md'), 'utf-8');

function buildRejectedContext(rejectedPosts) {
  if (!rejectedPosts.length) return '';

  const notes = rejectedPosts
    .filter(p => p.rejection_note)
    .map(p => `- "${p.title}" was rejected: ${p.rejection_note}`)
    .join('\n');

  if (!notes) return '';

  return `\nRECENTLY REJECTED POSTS (consider this feedback when picking a topic):\n${notes}`;
}

export async function selectTopic(context) {
  console.log('\n[Stage 2] Selecting topic...');

  const { profile, existingTitles, rejectedPosts } = context;

  const prompt = PROMPT_TEMPLATE
    .replace('{{business_name}}', profile.business_name)
    .replace('{{industry}}', profile.industry || 'general')
    .replace('{{target_audience}}', profile.target_audience || 'general audience')
    .replace('{{seed_keywords}}', (profile.seed_keywords || []).join(', '))
    .replace('{{existing_titles}}', existingTitles.length > 0
      ? existingTitles.map(t => `- ${t}`).join('\n')
      : '(none — this is the first post)')
    .replace('{{rejected_context}}', buildRejectedContext(rejectedPosts));

  const systemPrompt = 'You are an expert SEO content strategist. Return only valid JSON, no commentary.\n\n' +
    'Follow the people-first content philosophy, E-E-A-T principles, and keyword strategy from this Blog Writing Guide:\n\n' + BLOG_GUIDE;
  const topic = await callClaude(systemPrompt, prompt);

  if (topic._raw) {
    throw new Error(`Topic selection returned invalid JSON:\n${topic._raw.slice(0, 500)}`);
  }

  // Validate required fields
  const required = ['title', 'target_keyword', 'search_intent', 'angle'];
  for (const field of required) {
    if (!topic[field]) {
      throw new Error(`Topic brief missing required field: ${field}`);
    }
  }

  console.log(`  ✓ Topic: ${topic.title}`);
  console.log(`  ✓ Keyword: ${topic.target_keyword}`);
  console.log(`  ✓ Intent: ${topic.search_intent}`);
  console.log(`  ✓ Angle: ${topic.angle}`);

  return topic;
}
