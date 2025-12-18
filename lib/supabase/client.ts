import { createBrowserClient } from "@supabase/ssr"
import { createMockClient } from "./mock-client"
import { USE_MOCK_DEPENDENCIES } from "../config"

export function createClient() {
  if (USE_MOCK_DEPENDENCIES) {
    console.warn("🔧 Using mock Supabase client")
    return createMockClient() as any
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Your project's URL and Key are required to create a Supabase client!\n\n" +
      "Check your Supabase project's API settings to find these values:\n" +
      "https://supabase.com/dashboard/project/_/settings/api"
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
