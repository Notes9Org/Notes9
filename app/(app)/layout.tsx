import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { requireUser } from "@/lib/auth/current-user"
import { PlatformProvider } from "@/components/providers/platform-provider"
import { PLATFORM_COOKIE, readPlatformCookie } from "@/lib/shortcuts/platform"
import { ensureUserProfile } from "@/lib/ensure-user-profile"
import { AppLayout } from "@/components/layout/app-layout"
import { TermsAcceptanceModal } from "@/components/marketing/terms-acceptance-modal"
import { CURRENT_TERMS_VERSION } from "@/lib/constants"
import { AuthEventTracker } from "@/components/auth-event-tracker"
import { ActivityBeacon } from "@/components/activity-beacon"
import { AuthProvider } from "@/components/auth/auth-provider"
import { FeatureTimerProvider } from "@/components/telemetry/feature-timer-provider"
import { ReactQueryProvider } from "@/components/providers/react-query-provider"

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  // Bootstrap profile + organization on the server so every client component
  // downstream (sidebar, project picker, etc.) can assume they exist instead
  // of re-running create-on-miss logic in the navigation chrome.
  const profileResult = await ensureUserProfile(user)
  if (!profileResult.ok) {
    // Don't block render, sidebar will show an empty-workspace state and a
    // retry affordance. Emit a structured event so the failure is queryable
    // in server logs / CloudWatch Logs Insights.
    console.error(JSON.stringify({
      event: 'ensure_user_profile_failed',
      userId: user.id,
      reason: String(profileResult.reason ?? 'unknown'),
    }))
  }

  // Shortcut keycaps render `⌘` or `Ctrl` in the HTML itself. The server can
  // only know which from what the browser told us last time (ADR-020); absent
  // cookie reads as non-Mac and the provider corrects it after mount.
  const isMac = readPlatformCookie((await cookies()).get(PLATFORM_COOKIE)?.value)

  const currentTermsVersion = CURRENT_TERMS_VERSION
  const userTermsVersion = user.user_metadata?.terms_accepted_version
  const mustAcceptTerms = userTermsVersion !== currentTermsVersion

  return (
    <AuthProvider initialUser={user}>
      <PlatformProvider initialIsMac={isMac}>
      <ReactQueryProvider>
        {mustAcceptTerms && <TermsAcceptanceModal />}
        <Suspense>
          <AuthEventTracker />
        </Suspense>
        <FeatureTimerProvider />
        <Suspense>
          <ActivityBeacon />
        </Suspense>
        <AppLayout>{children}</AppLayout>
      </ReactQueryProvider>
      </PlatformProvider>
    </AuthProvider>
  )
}

