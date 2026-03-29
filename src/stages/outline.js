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
const BLOG_GUIDE = readFileSync(join(__dirname, '../BLOG_WRITING_GUIDE.md'), 'utf-8');

export async function generateOutline(context, topic) {
  console.log('\n[Stage 3] Generating outline...');

  const { profile, existingTitles } = context;

  const prompt = PROMPT_TEMPLATE
    .replace('{{business_name}}', profile.business_name)
    .replace('{{title}}', topic.title)
    .replace('{{target_keyword}}', topic.target_keyword)
    .replace('{{search_intent}}', topic.search_intent)
    .replace('{{angle}}', topic.angle)
    .replace('{{target_audience}}', profile.target_audience || 'general audience')
    .replace('{{industry}}', profile.industry || 'general')
    .replace('{{existing_titles}}', existingTitles.length > 0
      ? existingTitles.map(t => `- ${t}`).join('\n')
      : '(none)');

  const systemPrompt = 'You are an expert SEO content architect. Return only valid JSON, no commentary.\n\n' +
    'Follow the heading structure, keyword strategy, and content structure rules from this Blog Writing Guide:\n\n' + BLOG_GUIDE;
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
  console.log(`  ✓ Est. words: ${outline.estimated_word_count || 'not specified'}`);

  return outline;
}
