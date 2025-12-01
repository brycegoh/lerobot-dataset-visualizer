import { createClient } from "@supabase/supabase-js";

const env = (globalThis as any)?.process?.env ?? {};

const supabaseUrl = 
  env.SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseAnonKey = 
  env.SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log(`supabaseUrl: ${supabaseUrl}, supabaseAnonKey: ${supabaseAnonKey}`)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}


export const supabase = createClient(supabaseUrl, supabaseAnonKey);