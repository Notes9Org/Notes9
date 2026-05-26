import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function main() {
  const { data, error } = await supabase.from('whiteboard_notes').select('*').limit(1)
  if (error) console.error(error)
  else {
    if (data.length > 0) {
      console.log(Object.keys(data[0]))
    } else {
      console.log("No data")
    }
  }
}
main()
