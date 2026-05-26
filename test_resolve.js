const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function run() {
  const { data: exps } = await supabase.from('experiments').select('id').limit(1)
  if (!exps || exps.length === 0) return console.log("No experiments")
  const id = exps[0].id
  
  const res = await fetch(`http://localhost:3000/api/resolve-scope?path=/experiments/${id}`)
  const json = await res.json()
  console.log(json)
}
run()
