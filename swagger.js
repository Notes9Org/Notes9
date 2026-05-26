require('dotenv').config({ path: '.env.local' })
async function getSwagger() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const res = await fetch(url)
  const doc = await res.json()
  console.log(Object.keys(doc))
}
getSwagger()
