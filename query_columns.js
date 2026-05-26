const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const tables = ['projects', 'experiments', 'lab_notes', 'protocols', 'samples', 'papers', 'equipment']
  for (const table of tables) {
    const { data } = await supabase.from(table).select('*').limit(1)
    if (data) console.log(table, Object.keys(data[0] || {}))
  }
}
test()
