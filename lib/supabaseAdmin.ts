import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Supabase URL or Service Role Key is missing. Admin operations may fail.');
}

// Disable Next.js Data Cache for all Supabase fetch calls
const noStoreFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...init, cache: 'no-store' });

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  global: { fetch: noStoreFetch },
});
