import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardLabSection } from "@/components/org/dashboard-lab-section";

interface OrgSetupCTAProps {
  visible: boolean;
}

export function OrgSetupCTA({ visible }: OrgSetupCTAProps) {
  if (!visible) return null;

  return (
    <DashboardLabSection
      eyebrow="New here?"
      title="Set up My Lab"
      description="Create your lab organization to invite teammates, manage roles, and keep everyone on the same research workspace."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Building2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="max-w-xl">
            Most research teams start here — it only takes a minute, and you can
            invite collaborators right after.
          </p>
        </div>
        <Button asChild className="shrink-0 cursor-pointer">
          <Link href="/org/setup">Create my lab</Link>
        </Button>
      </div>
    </DashboardLabSection>
  );
}
