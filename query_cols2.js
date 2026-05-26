const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const { data } = await supabase.from('papers').select('*').limit(1).maybeSingle()
  console.log('papers:', data ? Object.keys(data) : 'no data')
  const { data: p } = await supabase.from('protocols').select('*').limit(1).maybeSingle()
  console.log('protocols:', p ? Object.keys(p) : 'no data')
}
test()
