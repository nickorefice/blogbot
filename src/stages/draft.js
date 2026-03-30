/**
 * Stage 4 — Draft Generation
 *
 * Takes the outline and client voice, writes the full blog post as markdown
 * with YAML frontmatter.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callClaudeText } from '../claude.js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_TEMPLATE = readFileSync(join(__dirname, '../prompts/draft.txt'), 'utf-8');
const BLOG_GUIDE = readFileSync(join(__dirname, '../BLOG_WRITING_GUIDE.md'), 'utf-8');

const WORD_COUNT_MIN = parseInt(process.env.DEFAULT_WORD_COUNT_MIN || '800', 10);
const WORD_COUNT_MAX = parseInt(process.env.DEFAULT_WORD_COUNT_MAX || '1200', 10);

/**
 * Parse YAML frontmatter from markdown text.
 * Returns { frontmatter: {}, body: string }
 */
function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: markdown };

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2].trim() };
}

export async function generateDraft(context, topic, outline) {
  console.log('\n[Stage 4] Generating draft...');

  const { profile } = context;

  // Build explicit links list so the model can't miss them
  const internalLinks = (outline.internal_links || [])
    .map(l => `- [${l.anchor_text}](${l.url})`)
    .join('\n');
  const externalLinks = (outline.external_links || [])
    .map(l => `- [${l.anchor_text}](${l.url}) — use in: ${l.context || 'any relevant section'}`)
    .join('\n');
  const linksBlock = [
    'LINKS YOU MUST INCLUDE (weave each one naturally into a paragraph):',
    internalLinks ? `Internal links:\n${internalLinks}` : '',
    externalLinks ? `External links:\n${externalLinks}` : '',
    !internalLinks && !externalLinks
      ? 'No links provided — you MUST still add at least 2 external authority links to reputable sources (.gov, .edu, Apple support, major publications).'
      : '',
  ].filter(Boolean).join('\n\n');

  const prompt = PROMPT_TEMPLATE
    .replace('{{business_name}}', profile.business_name)
    .replace('{{industry}}', profile.industry || 'general')
    .replace('{{target_keyword}}', topic.target_keyword)
    .replace(/\{\{target_keyword\}\}/g, topic.target_keyword)
    .replace('{{target_audience}}', profile.target_audience || 'general audience')
    .replace('{{brand_voice}}', profile.brand_voice || 'Professional and informative.')
    .replace('{{outline_json}}', JSON.stringify(outline, null, 2))
    .replace('{{word_count_min}}', String(WORD_COUNT_MIN))
    .replace('{{word_count_max}}', String(WORD_COUNT_MAX))
    .replace('{{domain}}', profile.domain || 'example.com')
    .replace('{{meta_description}}', outline.meta_description || '')
    + '\n\n' + linksBlock;

  const systemPrompt =
    `You are a professional SEO blog writer for ${profile.business_name}. ` +
    `Write in the brand voice provided. Output ONLY the markdown blog post with YAML frontmatter — no commentary before or after.\n\n` +
    `You MUST follow every rule in this Blog Writing Guide:\n\n${BLOG_GUIDE}`;

  const raw = await callClaudeText(systemPrompt, prompt, { maxTokens: 8192 });
  const { frontmatter, body } = parseFrontmatter(raw);

  const wordCount = body.split(/\s+/).length;

  const linkMatches = body.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
  console.log(`  ✓ Title: ${frontmatter.title || topic.title}`);
  console.log(`  ✓ Slug: ${frontmatter.slug || '(will generate)'}`);
  console.log(`  ✓ Word count: ${wordCount}`);
  console.log(`  ✓ Links in body: ${linkMatches.length}`);
  if (linkMatches.length === 0) {
    console.warn(`  ⚠ WARNING: Draft has zero links — the model ignored linking requirements`);
  }

  if (wordCount < WORD_COUNT_MIN * 0.7) {
    console.warn(`  ⚠ Draft is short (${wordCount} words, target ${WORD_COUNT_MIN}–${WORD_COUNT_MAX})`);
  }

  return {
    raw,
    frontmatter,
    body,
    wordCount
  };
}
