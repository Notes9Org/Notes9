import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
            <h1 className="text-2xl font-bold">Check Your Email</h1>
          </div>
          
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Verify Your Email</CardTitle>
              <CardDescription>
                We've sent you a confirmation email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Please check your inbox and click the verification link to activate your account.
                You won't be able to sign in until you've confirmed your email address.
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">
                  Return to Sign In
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
