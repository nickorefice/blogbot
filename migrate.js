import { supabase } from './src/supabase.js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

async function migrate() {
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration(s)\n`);

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Running ${file}...`);

    const { error } = await supabase.rpc('exec_sql', { sql_string: sql });

    if (error) {
      // rpc exec_sql may not exist — fall back to instructions
      console.error(`  ⚠ Could not auto-run migration: ${error.message}`);
      console.error(`  → Run this SQL manually in Supabase Dashboard > SQL Editor`);
      console.error(`  → File: migrations/${file}\n`);
    } else {
      console.log(`  ✓ ${file} applied\n`);
    }
  }

  console.log('Done. If any migrations failed, run them manually in the Supabase SQL Editor.');
}

migrate();
