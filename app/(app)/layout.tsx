import { Suspense } from 'react'
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { ensureUserProfile } from "@/lib/ensure-user-profile"
import { AppLayout } from "@/components/layout/app-layout"
import { TermsAcceptanceModal } from "@/components/marketing/terms-acceptance-modal"
import { CURRENT_TERMS_VERSION } from "@/lib/constants"
import { AuthEventTracker } from "@/components/auth-event-tracker"
import { AuthProvider } from "@/components/auth/auth-provider"

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const supabase = await createClient()

  // Bootstrap profile + organization on the server so every client component
  // downstream (sidebar, project picker, etc.) can assume they exist instead
  // of re-running create-on-miss logic in the navigation chrome.
  const profileResult = await ensureUserProfile(supabase, user)
  if (!profileResult.ok) {
    // Don't block render — sidebar will show an empty-workspace state and a
    // retry affordance. Emit a structured event so the failure is queryable
    // in server logs / CloudWatch Logs Insights.
    console.error(JSON.stringify({
      event: 'ensure_user_profile_failed',
      userId: user.id,
      reason: String(profileResult.reason ?? 'unknown'),
    }))
  }

  const currentTermsVersion = CURRENT_TERMS_VERSION
  const userTermsVersion = user.user_metadata?.terms_accepted_version
  const mustAcceptTerms = userTermsVersion !== currentTermsVersion

  return (
    <AuthProvider initialUser={user}>
      {mustAcceptTerms && <TermsAcceptanceModal />}
      <Suspense>
        <AuthEventTracker />
      </Suspense>
      <AppLayout>{children}</AppLayout>
    </AuthProvider>
  )
}

