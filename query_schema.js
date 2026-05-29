const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const res = await fetch(url)
  const swagger = await res.json()
  
  const tables = ['projects', 'experiments', 'lab_notes', 'protocols', 'samples', 'papers', 'equipment']
  for (const table of tables) {
    if (swagger.definitions && swagger.definitions[table]) {
      console.log(table, Object.keys(swagger.definitions[table].properties))
    }
  }
}
run()
