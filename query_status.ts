import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function main() {
  const { data, error } = await supabase.from('experiments').select('status')
  if (error) console.error(error)
  else {
    const statuses = new Set(data.map(d => d.status))
    console.log(Array.from(statuses))
  }
}
main()
