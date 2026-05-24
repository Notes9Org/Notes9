import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeading } from "@/components/ui/page-heading"
import Link from "next/link"
import { Mail, FlaskConical } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <FlaskConical className="h-6 w-6 text-primary-foreground" />
            </div>
            <PageHeading className="text-center">Check your email</PageHeading>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Verify your email</CardTitle>
              <CardDescription>
                We sent a confirmation link to the address you signed up with.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Click the link in the email to activate your account. Check your spam folder
                if it doesn&apos;t arrive within a few minutes.
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">
                  Go to sign in
                </Link>
              </Button>
              <p className="text-xs text-center text-muted-foreground/80">
                Already verified?{' '}
                <Link href="/auth/login" className="underline underline-offset-2 hover:text-foreground">
                  Sign in here
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
