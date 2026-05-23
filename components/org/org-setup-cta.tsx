import Link from "next/link";
import { Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OrgSetupCTAProps {
  visible: boolean;
}

export function OrgSetupCTA({ visible }: OrgSetupCTAProps) {
  if (!visible) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Use Notes9 for my lab
        </CardTitle>
        <CardDescription>
          Set up your lab organization to invite team members, manage roles, and
          collaborate on research together.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/org/setup">
          <Button className="cursor-pointer">Get Started</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
