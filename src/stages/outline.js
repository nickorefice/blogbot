/**
 * Stage 3 — Outline Generation
 *
 * Takes a topic brief and generates a structured blog post outline.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callClaude } from '../claude.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_TEMPLATE = readFileSync(join(__dirname, '../prompts/outline.txt'), 'utf-8');
// Key structure rules only — the full guide is too large for the outline prompt
const OUTLINE_GUIDE_EXCERPT = `KEY SEO PRINCIPLES FOR OUTLINE STRUCTURE:
- One H1 per page (the post title), then H2s for main sections
- Include the target keyword in the H1 and at least one H2
- Meta description: 150-160 characters, includes the keyword, has a clear value proposition
- Structure content to match search intent
- Plan for internal links to other relevant posts
- Include a clear CTA in the conclusion
- Aim for 4 main sections (H2s) for 800-1200 word posts
- Each section should have a clear purpose and unique angle`;

export async function generateOutline(context, topic) {
  console.log('\n[Stage 3] Generating outline...');

  const { profile, existingTitles } = context;
  const domain = profile.domain || 'example.com';

  const prompt = PROMPT_TEMPLATE
    .replace('{{business_name}}', profile.business_name)
    .replace('{{title}}', topic.title)
    .replace('{{target_keyword}}', topic.target_keyword)
    .replace('{{search_intent}}', topic.search_intent)
    .replace('{{angle}}', topic.angle)
    .replace('{{target_audience}}', profile.target_audience || 'general audience')
    .replace('{{industry}}', profile.industry || 'general')
    .replace('{{domain}}', domain)
    .replace('{{existing_titles}}', existingTitles.length > 0
      ? existingTitles.map(t => `- ${t}`).join('\n')
      : '(none — skip internal links)');

  const systemPrompt = 'You are an expert SEO content architect. Return only valid JSON, no commentary.\n\n' + OUTLINE_GUIDE_EXCERPT;
  const outline = await callClaude(systemPrompt, prompt);

  if (outline._raw) {
    throw new Error(`Outline generation returned invalid JSON:\n${outline._raw.slice(0, 500)}`);
  }

  // Validate
  if (!outline.h1 || !outline.sections || !outline.meta_description) {
    throw new Error('Outline missing required fields (h1, sections, or meta_description)');
  }

  console.log(`  ✓ H1: ${outline.h1}`);
  console.log(`  ✓ ${outline.sections.length} sections`);
  console.log(`  ✓ Meta: ${outline.meta_description.slice(0, 80)}...`);
  console.log(`  ✓ Internal links: ${(outline.internal_links || []).length}`);
  console.log(`  ✓ External links: ${(outline.external_links || []).length}`);
  console.log(`  ✓ Est. words: ${outline.estimated_word_count || 'not specified'}`);

  return outline;
}
