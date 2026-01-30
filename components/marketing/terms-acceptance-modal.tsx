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

export function TermsAcceptanceModal() {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleAccept = async () => {
        setIsLoading(true)
        try {
            await acceptTermsAction()
            toast.success("Terms accepted successfully")
            router.refresh()
        } catch (error) {
            toast.error("Failed to accept terms. Please try again.")
            console.error(error)
        } finally {
            setIsLoading(false)
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

                <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
                    <Button onClick={handleAccept} disabled={isLoading} className="w-full sm:w-auto">
                        {isLoading ? "Processing..." : "Agree and Proceed"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
