import { PrivacyContent } from "@/components/marketing/privacy-content"

export default function PrivacyPage() {
    return (
        <div className="flex-1 bg-background relative z-10">
            <div className="container max-w-4xl py-12 md:py-16 lg:py-20">
                <div className="rounded-lg border bg-card p-6 md:p-10 shadow-sm">
                    <PrivacyContent />
                </div>
            </div>
        </div>
    )
}
