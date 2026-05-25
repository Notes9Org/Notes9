import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  console.log("Fetching protocols with experiment_id...")
  const { data: protocols, error } = await supabase
    .from("protocols")
    .select("id, experiment_id")
    .not("experiment_id", "is", null)
    
  if (error) {
    console.error("Error fetching protocols:", error)
    return
  }
  
  console.log(`Found ${protocols.length} protocols with experiment_id`)
  
  let inserted = 0
  for (const p of protocols) {
    const { data: existing } = await supabase
      .from("experiment_protocols")
      .select("id")
      .eq("experiment_id", p.experiment_id)
      .eq("protocol_id", p.id)
      .maybeSingle()
      
    if (!existing) {
      const { error: insertErr } = await supabase
        .from("experiment_protocols")
        .insert({
          experiment_id: p.experiment_id,
          protocol_id: p.id
        })
      if (!insertErr) {
        inserted++
      } else {
        console.error("Error inserting:", insertErr)
      }
    }
  }
  
  console.log(`Successfully backfilled ${inserted} protocols into experiment_protocols`)
}

run()
