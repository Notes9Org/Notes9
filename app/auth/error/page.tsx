import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AlertCircle } from 'lucide-react'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Authentication Error</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {params?.error ? (
                <p className="text-sm text-center text-muted-foreground">
                  Error code: {params.error}
                </p>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  An authentication error occurred. Please try again.
                </p>
              )}
              <Button asChild className="w-full">
                <Link href="/auth/login">
                  Back to Sign In
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
