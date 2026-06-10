"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PrivacyContent } from "@/components/marketing/privacy-content"
import { acceptTermsAction } from "@/app/actions/terms"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

export function TermsAcceptanceModal() {
    const [isLoading, setIsLoading] = useState(false)
    const [isSigningOut, setIsSigningOut] = useState(false)
    const router = useRouter()

    const handleAccept = async () => {
        setIsLoading(true)
        try {
            await acceptTermsAction()
            // acceptTermsAction updates user_metadata.terms_accepted_version
            // server-side, but the app layout reads that version from the JWT
            // access token (local verification, refreshed only on expiry). Without
            // forcing a token refresh, router.refresh() re-reads the STALE token,
            // mustAcceptTerms stays true, and this modal re-appears - the user gets
            // stuck on "Agree and Proceed". Refresh the session so the new metadata
            // is minted into a fresh token before we re-render.
            const supabase = createClient()
            await supabase.auth.refreshSession()
            toast.success("Terms accepted successfully")
            router.refresh()
        } catch (error) {
            toast.error("Failed to accept terms. Please try again.")
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSignOut = async () => {
        setIsSigningOut(true)
        try {
            const supabase = createClient()
            await supabase.auth.signOut()
            window.location.href = "/auth/login"
        } catch (err) {
            toast.error("Failed to sign out. Please refresh the page.")
            console.error(err)
            setIsSigningOut(false)
        }
    }

    return (
        <Dialog open={true}>
            <DialogContent className="max-w-4xl max-h-[90vh] gap-0 p-0 flex flex-col overflow-hidden" showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                    <DialogTitle>Terms & Privacy Update</DialogTitle>
                    <DialogDescription>
                        Please review and accept our updated Terms & Privacy Notice to continue using Notes9.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 min-h-0">
                    <div className="pr-4 pb-4">
                        <PrivacyContent />
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background gap-2 sm:gap-2">
                    <Button variant="ghost" onClick={handleSignOut} disabled={isLoading || isSigningOut} className="w-full sm:w-auto">
                        {isSigningOut ? "Signing out..." : "Sign out"}
                    </Button>
                    <Button onClick={handleAccept} disabled={isLoading || isSigningOut} className="w-full sm:w-auto">
                        {isLoading ? "Processing..." : "Agree and Proceed"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
