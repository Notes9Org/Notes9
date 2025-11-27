import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AlertCircle } from 'lucide-react'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; description?: string }>
}) {
  const params = await searchParams
  const errorCode = params?.error
  const description = params?.description

  const getErrorMessage = () => {
    if (errorCode === 'email_already_exists') {
      return {
        title: "Account Already Exists",
        message: description || "An account with this email already exists. Please sign in with your existing account instead.",
      }
    }
    if (errorCode === 'server_error') {
      return {
        title: "Server Error",
        message: description || "An error occurred during authentication. Please try again.",
      }
    }
    return {
      title: "Authentication Error",
      message: description || `Error: ${errorCode || 'Unknown error'}. Please try again.`,
    }
  }

  const errorInfo = getErrorMessage()

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">{errorInfo.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                {errorInfo.message}
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link href="/auth/login">
                    Back to Sign In
                  </Link>
                </Button>
                {errorCode === 'email_already_exists' && (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/auth/sign-up">
                      Create New Account
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
