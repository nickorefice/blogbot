/**
 * Claude interface — uses the Claude Agent SDK (@anthropic-ai/claude-code)
 *
 * This runs through your existing local SSO authentication.
 * No API key needed — if you can use Claude Code, this works.
 */

import { query } from '@anthropic-ai/claude-code';

/**
 * Collect text output from a Claude Agent SDK query.
 * The SDK returns an async iterable of messages.
 */
async function collectText(prompt) {
  const conversation = query({
    prompt,
    options: {
      maxTurns: 1,
      allowedTools: []
    }
  });

  let text = '';
  for await (const msg of conversation) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }
    }
  }

  return text;
}

/**
 * Call Claude with a system prompt and user message, expecting JSON back.
 */
export async function callClaude(systemPrompt, userMessage) {
  // Combine everything into a single prompt to avoid the sub-agent treating it as a task
  const prompt = `SYSTEM CONTEXT: ${systemPrompt}

USER REQUEST:
${userMessage}

YOUR RESPONSE MUST BE ONLY A VALID JSON OBJECT. No tools, no code blocks, no commentary, no "I'll" or "Let me" — start with { and end with }`;

  const text = await collectText(prompt);

  // Find the JSON object — look for balanced braces
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return { _raw: text };

  let depth = 0;
  let lastBrace = -1;
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) { lastBrace = i; break; } }
  }

  const cleaned = lastBrace > firstBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text.slice(firstBrace);

  try {
    return JSON.parse(cleaned);
  } catch {
    return { _raw: text };
  }
}

/**
 * Call Claude for long-form content (draft generation).
 * Returns raw text, not JSON.
 */
export async function callClaudeText(systemPrompt, userMessage) {
  const prompt = `You are a blog writer. Your ENTIRE response must be the blog post itself. Do not describe what you will write. Do not use tools. Do not say "I'll" or "Let me" or "Here's". Start your response directly with the --- YAML frontmatter delimiter.

WRITING INSTRUCTIONS:
${systemPrompt}

ASSIGNMENT:
${userMessage}

BEGIN YOUR BLOG POST NOW (start with --- for YAML frontmatter):`;

  const text = await collectText(prompt);
  return text;
}
