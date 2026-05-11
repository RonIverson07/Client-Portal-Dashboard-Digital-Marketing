import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env.local file.');
}

// Custom fetch that disables Next.js Data Cache.
// Next.js 14 extends the global fetch() with aggressive caching by default.
// Supabase JS uses fetch internally, so without this override every DB query
// can be served from the stale Next.js Data Cache on Vercel — causing the
// "client approval board doesn't update" bug.
const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...init, cache: 'no-store' });

// Client-side / fallback client (subject to RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: noStoreFetch },
});

// Server-side admin client — bypasses RLS entirely.
// Use this in all API routes so writes (especially client_id updates) always persist.
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: { fetch: noStoreFetch },
    })
  : supabase;
