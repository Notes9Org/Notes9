import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { AppLayout } from "@/components/layout/app-layout"
import { TermsAcceptanceModal } from "@/components/marketing/terms-acceptance-modal"
import { CURRENT_TERMS_VERSION } from "@/lib/constants"

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If not authenticated, redirect to login
  if (!user) {
    redirect("/auth/login")
  }

  const currentTermsVersion = CURRENT_TERMS_VERSION
  const userTermsVersion = user.user_metadata?.terms_accepted_version
  const mustAcceptTerms = userTermsVersion !== currentTermsVersion

  return (
    <>
      {mustAcceptTerms && <TermsAcceptanceModal />}
      <AppLayout>{children}</AppLayout>
    </>
  )
}

