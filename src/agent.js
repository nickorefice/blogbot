/**
 * WebManage Blog Agent — Orchestrator
 *
 * Runs the full pipeline: Context → Topic → Outline → Draft → Queue
 *
 * Usage:
 *   npm run agent -- --client-id <uuid>          Generate one post for a specific client
 *   npm run agent -- --all                       Generate one post for each client due for content
 *   npm run agent -- --daemon                    Listen for on-demand requests via Supabase Realtime
 */

import 'dotenv/config';
import { loadClientContext } from './stages/context.js';
import { selectTopic } from './stages/topic.js';
import { generateOutline } from './stages/outline.js';
import { generateDraft } from './stages/draft.js';
import { queuePost } from './stages/queue.js';
import { supabase } from './supabase.js';

// ─── CLI args ───────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--client-id' && args[i + 1]) {
      flags.clientId = args[i + 1];
      i++;
    }
    if (args[i] === '--all') {
      flags.all = true;
    }
    if (args[i] === '--dry-run') {
      flags.dryRun = true;
    }
    if (args[i] === '--daemon') {
      flags.daemon = true;
    }
  }

  return flags;
}

// ─── Run pipeline for one client ────────────────────────

async function runForClient(clientId, { dryRun = false } = {}) {
  const startTime = Date.now();

  console.log('═'.repeat(60));
  console.log(`Blog Agent — generating post for client ${clientId}`);
  console.log('═'.repeat(60));

  try {
    // Stage 1: Load context
    const context = await loadClientContext(clientId);

    // Stage 2: Pick topic
    const topic = await selectTopic(context);

    // Stage 3: Generate outline
    const outline = await generateOutline(context, topic);

    // Stage 4: Write draft
    const draft = await generateDraft(context, topic, outline);

    if (dryRun) {
      console.log('\n[Dry Run] Skipping Supabase write. Draft preview:\n');
      console.log(draft.raw.slice(0, 500) + '...\n');
      return { success: true, dryRun: true, topic };
    }

    // Stage 5: Queue post
    const post = await queuePost(context, topic, outline, draft);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ Done in ${elapsed}s — post is now pending_review in Supabase`);
    console.log(`  Client can approve/reject in the iOS app.\n`);

    return { success: true, post, topic };

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n✗ Failed after ${elapsed}s: ${err.message}\n`);
    return { success: false, error: err.message };
  }
}

// ─── Run for all clients due for content ────────────────

async function runForAllClients({ dryRun = false } = {}) {
  console.log('Fetching all client profiles...\n');

  const { data: clients, error } = await supabase
    .from('client_profiles')
    .select('id, business_name, generation_cadence');

  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`);
  }

  if (!clients.length) {
    console.log('No client profiles found. Run "npm run seed" to create a test client.');
    return;
  }

  console.log(`Found ${clients.length} client(s)\n`);

  const results = [];

  for (const client of clients) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Processing: ${client.business_name} (${client.id})`);
    console.log('─'.repeat(60));

    const result = await runForClient(client.id, { dryRun });
    results.push({ clientId: client.id, name: client.business_name, ...result });
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  for (const r of results) {
    const status = r.success ? '✓' : '✗';
    const detail = r.success
      ? (r.dryRun ? '[dry run]' : r.topic?.title || 'done')
      : r.error;
    console.log(`  ${status} ${r.name}: ${detail}`);
  }

  const succeeded = results.filter(r => r.success).length;
  console.log(`\n${succeeded}/${results.length} succeeded\n`);
}

// ─── Daemon mode — Realtime listener ───────────────────

let processing = false;

async function processRequest(request) {
  const { id, client_id } = request;

  if (processing) {
    console.log(`  ⏳ Already processing a request — ${id} will be picked up next`);
    return;
  }

  processing = true;

  console.log(`\n📥 New generation request: ${id} for client ${client_id}`);

  // Mark as in_progress
  await supabase
    .from('generation_requests')
    .update({ status: 'in_progress' })
    .eq('id', id);

  const result = await runForClient(client_id);

  if (result.success) {
    await supabase
      .from('generation_requests')
      .update({
        status: 'completed',
        post_id: result.post?.id || null,
        completed_at: new Date().toISOString()
      })
      .eq('id', id);

    console.log(`✅ Request ${id} completed`);
  } else {
    await supabase
      .from('generation_requests')
      .update({
        status: 'failed',
        error: result.error,
        completed_at: new Date().toISOString()
      })
      .eq('id', id);

    console.error(`❌ Request ${id} failed: ${result.error}`);
  }

  processing = false;

  // Check if any pending requests queued up while we were processing
  await drainPendingRequests();
}

async function drainPendingRequests() {
  const { data: pending } = await supabase
    .from('generation_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (pending && pending.length > 0) {
    await processRequest(pending[0]);
  }
}

async function startDaemon() {
  console.log('═'.repeat(60));
  console.log('Blog Agent — Daemon Mode');
  console.log('Listening for generation requests via Supabase Realtime...');
  console.log('Press Ctrl+C to stop');
  console.log('═'.repeat(60));

  // First, drain any pending requests that were created while the daemon was offline
  console.log('\nChecking for pending requests...');
  await drainPendingRequests();
  console.log('Ready — waiting for new requests.\n');

  // Subscribe to INSERT events on generation_requests
  const channel = supabase
    .channel('generation-requests')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'generation_requests',
        filter: 'status=eq.pending'
      },
      (payload) => {
        processRequest(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('📡 Realtime subscription active\n');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('⚠ Realtime connection error — will retry automatically');
      }
    });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down daemon...');
    await supabase.removeChannel(channel);
    console.log('Realtime subscription removed. Goodbye.');
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const flags = parseArgs();

  if (!flags.clientId && !flags.all && !flags.daemon) {
    console.log('Usage:');
    console.log('  npm run agent -- --client-id <uuid>     Generate for one client');
    console.log('  npm run agent -- --all                  Generate for all clients');
    console.log('  npm run agent -- --daemon               Listen for on-demand requests');
    console.log('  Add --dry-run to preview without writing to Supabase');
    process.exit(1);
  }

  if (flags.daemon) {
    await startDaemon();
  } else if (flags.clientId) {
    await runForClient(flags.clientId, { dryRun: flags.dryRun });
  } else if (flags.all) {
    await runForAllClients({ dryRun: flags.dryRun });
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
