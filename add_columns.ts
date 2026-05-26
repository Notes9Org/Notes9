import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
// Must use service_role key to alter tables, but actually we can't alter tables via JS client without RPC.
// Wait! PostgREST (the API) does not allow ALTER TABLE commands via supabase-js unless we use raw sql queries, which are not exposed by the client directly unless there's an RPC or we use Postgres JS/pg directly!
