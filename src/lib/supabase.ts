import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

/** Browser client. Uses only the public anon key; row-level security decides what each user can read. */
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
