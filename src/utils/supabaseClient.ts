import { createClient } from "@supabase/supabase-js";

const env = (globalThis as any)?.process?.env ?? {};

const supabaseUrl = 
  env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://wkmnlrsvooiefqfauoud.supabase.co";

const supabaseAnonKey = 
  env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrbW5scnN2b29pZWZxZmF1b3VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzY1ODQsImV4cCI6MjA3OTAxMjU4NH0.D201wcBxfgDFDIR8YX4Ms-ZvFkPCWX9dqBFBqI0KvjQ";

// console.log(`supabaseUrl: ${supabaseUrl}, supabaseAnonKey: ${supabaseAnonKey}`)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}


export const supabase = createClient(supabaseUrl, supabaseAnonKey);