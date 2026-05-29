const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const { data, error } = await supabase
    .from('experiments')
    .select('id, name, project_id, projects(id, name)')
    .limit(1)
  console.log(JSON.stringify({data, error}, null, 2))
}
test()
