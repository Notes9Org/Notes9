import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function run() {
  const { data, error } = await supabase
      .from("experiment_protocols")
      .select(`
        id,
        added_at,
        protocol:protocols(
          id,
          name,
          description,
          version,
          created_at
        )
      `)
  console.log("Data:", data)
  console.log("Error:", error)
}
run()
