import { updateSession } from "@/lib/supabase/middleware"
import { type NextRequest } from "next/server"

// Next.js 16 middleware entry (renamed from middleware.ts). This file is
// load-bearing: it runs updateSession on every page navigation, which is the
// ONLY place expired Supabase access tokens get refreshed and stale auth
// cookies get healed server-side. Deleting it makes every authenticated API
// route 401 once the access token expires (~1h) until the user re-logs-in.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|pdf|txt|xml|ico)$).*)",
  ],
}
